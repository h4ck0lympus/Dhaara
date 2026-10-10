//! Opt-in Linux service owner. No admin-token reader or automatic reconnect.
use fs2::FileExt;
use serde_json::{json, Value};
use std::{
    fs::{self, File, OpenOptions},
    io::{BufRead, BufReader, Read, Write},
    net::{SocketAddr, TcpListener, TcpStream},
    os::{
        fd::AsRawFd,
        unix::{fs::OpenOptionsExt, process::CommandExt},
    },
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::mpsc::{self, Receiver, Sender},
    thread,
    time::{Duration, Instant},
};

#[derive(Clone, Debug)]
pub struct Config {
    pub python: PathBuf,
    pub entry: PathBuf,
    pub workspace: PathBuf,
    pub origin: String,
    pub timeout: Duration,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Event {
    Starting,
    Ready(u32),
    Error(&'static str),
    Stopped,
}
#[derive(Clone, Copy, Debug)]
pub enum Control {
    Retry,
    Quit,
}

pub struct Owner {
    pub tx: Sender<Control>,
}
impl Owner {
    pub fn spawn(config: Config, notify: impl Fn(Event) + Send + 'static) -> Self {
        // UI commands must never block the event loop or drop Quit behind Retry.
        let (tx, rx) = mpsc::channel();
        thread::spawn(move || actor(config, rx, notify));
        Self { tx }
    }
}

fn workspace(config: &Config) -> Result<(PathBuf, File), &'static str> {
    if config.workspace.file_name().is_none() {
        return Err("Choose a dedicated data directory.");
    }
    let existed = config.workspace.exists();
    fs::create_dir_all(&config.workspace)
        .map_err(|_| "Cannot create the data directory. Check its permissions.")?;
    if !existed {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&config.workspace, fs::Permissions::from_mode(0o700))
            .map_err(|_| "Cannot protect the data directory.")?;
    }
    let path =
        fs::canonicalize(&config.workspace).map_err(|_| "Cannot access the data directory.")?;
    let file = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .mode(0o600)
        .custom_flags(libc::O_NOFOLLOW)
        .open(path.join(".noema-service.lock"))
        .map_err(|_| "Cannot open the workspace service lock.")?;
    file.try_lock_exclusive().map_err(|_| {
        "This workspace already has a service. Use external mode or stop it deliberately."
    })?;
    Ok((path, file))
}

struct Instance {
    child: Child,
    _lock: File,
    _listener: TcpListener,
}
impl Instance {
    // waitid WNOWAIT retains our child's PID until group cleanup, preventing PID
    // reuse between detecting exit and stopping any remaining owned descendants.
    fn exited(&self) -> bool {
        let mut info: libc::siginfo_t = unsafe { std::mem::zeroed() };
        let result = unsafe {
            libc::waitid(
                libc::P_PID,
                self.child.id(),
                &mut info,
                libc::WEXITED | libc::WNOHANG | libc::WNOWAIT,
            )
        };
        result == 0 && unsafe { info.si_pid() } != 0
    }
    fn stop(mut self) {
        drop(self.child.stdin.take());
        let deadline = Instant::now() + Duration::from_secs(5);
        while !self.exited() && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(40));
        }
        // Never signal by process name/PID file. This unreaped child is the
        // leader of the dedicated group we created in pre_exec.
        unsafe {
            libc::kill(-(self.child.id() as i32), libc::SIGTERM);
        }
        let deadline = Instant::now() + Duration::from_secs(1);
        while !self.exited() && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(40));
        }
        unsafe {
            libc::kill(-(self.child.id() as i32), libc::SIGKILL);
        }
        let _ = self.child.wait();
    }
}

fn launch(config: &Config) -> Result<(Instance, Receiver<Value>, PathBuf, String), &'static str> {
    crate::validate_server(&config.origin).map_err(|_| "Invalid managed loopback origin.")?;
    let (path, lock) = workspace(config)?;
    let url = url::Url::parse(&config.origin).map_err(|_| "Invalid managed origin.")?;
    let host = url
        .host_str()
        .ok_or("Missing loopback host.")?
        .trim_matches(['[', ']']);
    let address: SocketAddr = format!(
        "{}:{}",
        if host.contains(':') {
            format!("[{host}]")
        } else {
            host.to_string()
        },
        url.port_or_known_default().unwrap_or(8765)
    )
    .parse()
    .map_err(|_| "Invalid loopback endpoint.")?;
    let listener = TcpListener::bind(address).map_err(|_| "Endpoint is occupied or unavailable. Do not stop its occupant; choose external mode or a deliberate stable endpoint.")?;
    let mut random = [0u8; 32];
    File::open("/dev/urandom")
        .and_then(|mut f| f.read_exact(&mut random))
        .map_err(|_| "Cannot generate a fresh service identity.")?;
    let instance: String = random.iter().map(|b| format!("{b:02x}")).collect();
    let socket_fd = listener.as_raw_fd();
    let lock_fd = lock.as_raw_fd();
    let parent_pid = unsafe { libc::getpid() };
    let mut command = Command::new(&config.python);
    command
        .arg(&config.entry)
        .arg("--desktop-managed")
        .arg("--host")
        .arg(host)
        .arg("--port")
        .arg(address.port().to_string())
        .arg("--data-dir")
        .arg(&path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    for key in [
        "NOEMA_MODEL",
        "NOEMA_SPEECH_MODEL",
        "NOEMA_TOKEN",
        "NOEMA_ACCESS_TOKEN",
        "NOEMA_ALLOWED_HOSTS",
        "NOEMA_ALLOW_REMOTE_MODEL",
        "NOEMA_DATA_DIR",
    ] {
        command.env_remove(key);
    }
    // Duplicate to high temporary descriptors first: source FDs may themselves
    // be 3/4 and must not be clobbered by the target remapping.
    unsafe {
        command.pre_exec(move || {
            // Backstop before Python imports/lease watcher exist. Close the
            // parent-death race as well; never rely on Child::drop for cleanup.
            if libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGTERM) != 0 {
                return Err(std::io::Error::last_os_error());
            }
            if libc::getppid() != parent_pid {
                libc::_exit(125);
            }
            if libc::setpgid(0, 0) != 0 {
                return Err(std::io::Error::last_os_error());
            }
            let sock = libc::fcntl(socket_fd, libc::F_DUPFD_CLOEXEC, 10);
            let workspace = libc::fcntl(lock_fd, libc::F_DUPFD_CLOEXEC, 10);
            if sock < 0 || workspace < 0 || libc::dup2(sock, 3) < 0 || libc::dup2(workspace, 4) < 0
            {
                return Err(std::io::Error::last_os_error());
            }
            libc::close(sock);
            libc::close(workspace);
            Ok(())
        });
    }
    let child = command.spawn().map_err(|_| "Cannot start Python. Check --python and installed dependencies; no installation is automatic.")?;
    let mut owned = Instance {
        child,
        _lock: lock,
        _listener: listener,
    };
    if writeln!(
        owned.child.stdin.as_mut().unwrap(),
        "{}",
        json!({"instance":instance})
    )
    .is_err()
    {
        owned.stop();
        return Err("Python exited before accepting the desktop lease.");
    }
    let output = owned.child.stdout.take().unwrap();
    let (tx, rx) = mpsc::sync_channel(1);
    thread::spawn(move || {
        let mut line = String::new();
        let mut reader = BufReader::new(output.take(4096));
        if reader.read_line(&mut line).is_ok() {
            if let Ok(value) = serde_json::from_str(&line) {
                let _ = tx.send(value);
            }
        }
        // All later child output is deliberately discarded, never copied to logs.
    });
    Ok((owned, rx, path, instance))
}

fn verify_http(config: &Config, instance: &str, pid: u32) -> bool {
    let Ok(url) = url::Url::parse(&config.origin) else {
        return false;
    };
    let Ok(addresses) = url.socket_addrs(|| None) else {
        return false;
    };
    let Some(address) = addresses.first() else {
        return false;
    };
    let Ok(mut stream) = TcpStream::connect_timeout(address, Duration::from_millis(300)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(300)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(300)));
    let request = format!(
        "GET /api/desktop-instance HTTP/1.1\r\nHost: {}\r\nConnection: close\r\n\r\n",
        &config.origin[7..]
    );
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    let mut response = String::new();
    if stream.take(8192).read_to_string(&mut response).is_err() {
        return false;
    }
    let Some((head, body)) = response.split_once("\r\n\r\n") else {
        return false;
    };
    let Ok(value) = serde_json::from_str::<Value>(body) else {
        return false;
    };
    head.starts_with("HTTP/1.1 200 ")
        && value == json!({"protocol":1,"instance":instance,"pid":pid})
}

fn actor(config: Config, rx: Receiver<Control>, notify: impl Fn(Event)) {
    let mut start = true;
    loop {
        if !start {
            match rx.recv() {
                Ok(Control::Retry) => {}
                _ => {
                    notify(Event::Stopped);
                    return;
                }
            }
        }
        start = false;
        notify(Event::Starting);
        let (owned, ready, path, instance) = match launch(&config) {
            Ok(value) => value,
            Err(error) => {
                notify(Event::Error(error));
                continue;
            }
        };
        let deadline = Instant::now() + config.timeout;
        let mut quit = false;
        let mut error = "Service readiness timed out. Check Python dependencies and data permissions, then Retry.";
        let mut verified = false;
        while Instant::now() < deadline {
            if let Ok(Control::Quit) = rx.try_recv() {
                quit = true;
                break;
            }
            if owned.exited() {
                error = "Service exited during startup. Check Python dependencies, entry point and data permissions.";
                break;
            }
            if let Ok(value) = ready.try_recv() {
                if value["workspace"] == path.to_string_lossy().as_ref()
                    && value["protocol"] == 1
                    && value["instance"] == instance
                    && value["pid"] == owned.child.id()
                    && verify_http(&config, &instance, owned.child.id())
                {
                    verified = true;
                    break;
                }
                error = "Service identity verification failed. No workspace credentials were sent.";
                break;
            }
            thread::sleep(Duration::from_millis(30));
        }
        if !verified {
            owned.stop();
            if quit {
                notify(Event::Stopped);
                return;
            }
            // Discard duplicate retries from the in-flight startup, not new ones.
            while let Ok(control) = rx.try_recv() {
                if matches!(control, Control::Quit) {
                    notify(Event::Stopped);
                    return;
                }
            }
            notify(Event::Error(error));
            continue;
        }
        notify(Event::Ready(owned.child.id()));
        loop {
            match rx.recv_timeout(Duration::from_millis(150)) {
                Ok(Control::Quit) | Err(mpsc::RecvTimeoutError::Disconnected) => {
                    owned.stop();
                    notify(Event::Stopped);
                    return;
                }
                Ok(Control::Retry) => {} // Already running: retries never spawn another service.
                Err(mpsc::RecvTimeoutError::Timeout) => {}
            }
            if owned.exited() {
                owned.stop();
                notify(Event::Error("Managed service stopped unexpectedly. Your local draft stays in this window; Retry explicitly."));
                break;
            }
        }
    }
}

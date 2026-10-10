use std::path::PathBuf;

struct Options {
    server: String,
    profile: PathBuf,
    #[cfg(target_os = "linux")]
    managed: Option<noema_desktop::service::Config>,
    #[cfg(feature = "qa")]
    stage: Option<String>,
}

fn options() -> Result<Option<Options>, String> {
    let mut server = "http://127.0.0.1:8765".to_owned();
    let mut profile = None;
    let mut managed = false;
    let mut data = None;
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .to_path_buf();
    let mut python = root.join(".venv/bin/python");
    let mut entry = root.join("run.py");
    let mut timeout = 15.0_f64;
    #[cfg(feature = "qa")]
    let mut stage = None;
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--manage-service" => managed = true,
            "--data-dir" => {
                data = Some(PathBuf::from(args.next().ok_or("--data-dir needs a path")?))
            }
            "--python" => python = PathBuf::from(args.next().ok_or("--python needs a path")?),
            "--entry-point" => {
                entry = PathBuf::from(args.next().ok_or("--entry-point needs a path")?)
            }
            "--startup-timeout" => {
                timeout = args
                    .next()
                    .ok_or("--startup-timeout needs seconds")?
                    .parse()
                    .map_err(|_| "Invalid startup timeout")?
            }
            "--server" => server = args.next().ok_or("--server needs a URL")?,
            "--profile" => {
                profile = Some(PathBuf::from(args.next().ok_or("--profile needs a path")?))
            }
            #[cfg(feature = "qa")]
            "--qa-stage" => stage = Some(args.next().ok_or("--qa-stage needs a stage")?),
            "--help" => {
                println!("Noema Rust webview desktop\nDefault: external service; start Python separately.\n--server http://127.0.0.1:8765 --profile /path/to/private/profile\nOpt-in Linux development mode: --manage-service --data-dir /path/to/workspace\nOptional: --python /path/to/python --entry-point /path/to/run.py --startup-timeout 15\nClose checkpoints then quits; Hide keeps the owned service running. Retry is explicit.\nBrowser drafts are NOT migrated into this separate webview profile.");
                return Ok(None);
            }
            _ => {
                return Err(
                    "Unknown argument; use --help. No token file is needed by the webview.".into(),
                )
            }
        }
    }
    let server = noema_desktop::validate_server(&server)?;
    if !timeout.is_finite() || !(0.1..=60.0).contains(&timeout) {
        return Err("Use a startup timeout from 0.1 to 60 seconds".into());
    }
    if !managed && data.is_some() {
        return Err(
            "--data-dir requires explicit --manage-service; external mode never owns a service"
                .into(),
        );
    }
    #[cfg(not(target_os = "linux"))]
    if managed {
        return Err("Managed development mode is supported only on Linux".into());
    }
    #[cfg(target_os = "linux")]
    let managed = if managed {
        let data =
            data.ok_or("Managed mode requires an explicit --data-dir; no implicit real notebook")?;
        let cwd = std::env::current_dir().map_err(|_| "Cannot resolve launch directory")?;
        let absolute = |path: PathBuf| {
            if path.is_absolute() {
                path
            } else {
                cwd.join(path)
            }
        };
        Some(noema_desktop::service::Config {
            python: absolute(python),
            entry: absolute(entry),
            workspace: absolute(data),
            origin: server.clone(),
            timeout: std::time::Duration::from_secs_f64(timeout),
        })
    } else {
        None
    };
    Ok(Some(Options {
        server,
        #[cfg(target_os = "linux")]
        managed,
        profile: match profile {
            Some(path) => path,
            None => noema_desktop::default_profile()?,
        },
        #[cfg(feature = "qa")]
        stage,
    }))
}

fn main() {
    match options() {
        Ok(Some(options)) => {
            #[cfg(feature = "webview")]
            if let Err(error) = run(options) {
                eprintln!("Noema: {error}");
                std::process::exit(1);
            }
            #[cfg(not(feature = "webview"))]
            {
                let _ = options;
                eprintln!("Build with the default webview feature to launch Noema.");
                std::process::exit(2);
            }
        }
        Ok(None) => {}
        Err(error) => {
            eprintln!("Noema: {error}");
            std::process::exit(2);
        }
    }
}

#[cfg(feature = "webview")]
fn run(options: Options) -> Result<(), Box<dyn std::error::Error>> {
    use std::{cell::Cell, rc::Rc};
    use tao::{
        dpi::LogicalSize,
        event::{Event, WindowEvent},
        event_loop::{ControlFlow, EventLoopBuilder},
        window::WindowBuilder,
    };
    use wry::{WebContext, WebViewBuilder};
    #[derive(Debug)]
    enum Message {
        Close,
        #[cfg(target_os = "linux")]
        Service(noema_desktop::service::Event),
        #[cfg(target_os = "linux")]
        Retry,
        #[cfg(target_os = "linux")]
        RequestClose,
        #[cfg(feature = "qa")]
        Report(String),
        #[cfg(all(feature = "qa", target_os = "linux"))]
        QaRetry,
    }

    let _profile_lock = noema_desktop::lock_profile(&options.profile)?;
    let event_loop = EventLoopBuilder::<Message>::with_user_event().build();
    let window = WindowBuilder::new()
        .with_title("Noema")
        .with_inner_size(LogicalSize::new(1200.0, 800.0))
        .with_min_inner_size(LogicalSize::new(380.0, 540.0))
        .build(&event_loop)?;
    let mut context = WebContext::new(Some(options.profile.clone()));
    let proxy = event_loop.create_proxy();
    let origin = options.server.clone();
    let navigation_origin = origin.clone();
    let download_origin = origin.clone();
    let loaded = Rc::new(Cell::new(false));
    let page_loaded = loaded.clone();
    let mut builder = WebViewBuilder::new_with_web_context(&mut context)
        .with_background_color((16, 17, 16, 255))
        .with_devtools(false)
        .with_navigation_handler(move |target| {
            noema_desktop::same_origin(&navigation_origin, &target)
        })
        .with_new_window_req_handler(|target, _| {
            // Trusted local frontend emits these for explicit session links.
            if noema_desktop::external_link_allowed(&target) {
                if webbrowser::open(&target).is_err() {
                    eprintln!("Could not open the external link in your browser");
                }
            }
            wry::NewWindowResponse::Deny
        })
        .with_download_started_handler(move |target, _| {
            noema_desktop::download_allowed(&download_origin, &target)
        })
        .with_on_page_load_handler(move |event, _| {
            page_loaded.set(matches!(event, wry::PageLoadEvent::Finished));
        })
        .with_ipc_handler(move |request| {
            if !noema_desktop::same_origin(&origin, &request.uri().to_string()) {
                return;
            }
            if request.body() == "noema:close-approved" {
                let _ = proxy.send_event(Message::Close);
            }
            #[cfg(feature = "qa")]
            if request.body().starts_with("noema:qa:") {
                let _ = proxy.send_event(Message::Report(request.body()[9..].to_owned()));
            }
            #[cfg(all(feature = "qa", target_os = "linux"))]
            if request.body() == "noema:qa-retry" {
                let _ = proxy.send_event(Message::QaRetry);
            }
        });
    #[cfg(target_os = "linux")]
    let is_managed = options.managed.is_some();
    #[cfg(not(target_os = "linux"))]
    let is_managed = false;
    // Do not navigate to an occupied/unverified endpoint, even to show an error.
    builder = if is_managed {
        builder.with_html("<html><body style='background:#101110'></body></html>")
    } else {
        builder.with_url(&options.server)
    };
    #[cfg(target_os = "linux")]
    let startup = {
        use gtk::prelude::*;
        use tao::platform::unix::WindowExtUnix;
        let bar = gtk::Box::new(gtk::Orientation::Vertical, 8);
        bar.set_no_show_all(!is_managed);
        bar.set_margin_top(16);
        bar.set_margin_bottom(16);
        bar.set_margin_start(20);
        bar.set_margin_end(20);
        let label = gtk::Label::new(Some("Starting the managed local service…"));
        label.set_line_wrap(true);
        label.set_max_width_chars(70);
        let buttons = gtk::Box::new(gtk::Orientation::Horizontal, 8);
        let retry = gtk::Button::with_label("Retry service");
        retry.set_sensitive(false);
        let cancel = gtk::Button::with_label("Cancel / Quit");
        let p = event_loop.create_proxy();
        retry.connect_clicked(move |_| {
            let _ = p.send_event(Message::Retry);
        });
        let p = event_loop.create_proxy();
        cancel.connect_clicked(move |_| {
            let _ = p.send_event(Message::RequestClose);
        });
        buttons.pack_start(&retry, false, false, 0);
        buttons.pack_start(&cancel, false, false, 0);
        bar.pack_start(&label, false, false, 0);
        bar.pack_start(&buttons, false, false, 0);
        window
            .default_vbox()
            .ok_or("Missing GTK window container")?
            .pack_start(&bar, false, false, 0);
        if is_managed {
            bar.show_all();
        }
        (bar, label, retry, cancel)
    };
    #[cfg(target_os = "linux")]
    {
        builder = builder.with_permission_handler(|kind| {
            use gtk::prelude::*;
            use wry::{PermissionKind, PermissionResponse};
            let purpose = match kind {
                PermissionKind::Microphone => "use your microphone for a recording",
                PermissionKind::Camera => "use your camera",
                PermissionKind::Notifications => "show notifications",
                PermissionKind::Geolocation | PermissionKind::DisplayCapture => {
                    return PermissionResponse::Deny
                }
                _ => return PermissionResponse::Default,
            };
            let dialog = gtk::MessageDialog::new(
                None::<&gtk::Window>,
                gtk::DialogFlags::MODAL,
                gtk::MessageType::Question,
                gtk::ButtonsType::YesNo,
                &format!("Allow Noema to {purpose}?"),
            );
            let allowed = dialog.run() == gtk::ResponseType::Yes;
            dialog.close();
            if allowed {
                PermissionResponse::Allow
            } else {
                PermissionResponse::Deny
            }
        });
    }
    #[cfg(feature = "qa")]
    if let Some(stage) = &options.stage {
        let script = format!(
            "window.__noemaQaStage={};\n{}",
            serde_json::to_string(stage)?,
            include_str!("../qa/scenario.js")
        );
        builder = builder.with_initialization_script_for_main_only(script, true);
    }
    #[cfg(target_os = "linux")]
    let webview = {
        use tao::platform::unix::WindowExtUnix;
        use wry::WebViewBuilderExtUnix;
        builder.build_gtk(
            window
                .default_vbox()
                .ok_or("Missing GTK window container")?,
        )?
    };
    #[cfg(not(target_os = "linux"))]
    let webview = builder.build(&window)?;

    #[cfg(target_os = "linux")]
    let owner = options.managed.map(|config| {
        let proxy = event_loop.create_proxy();
        noema_desktop::service::Owner::spawn(config, move |event| {
            let _ = proxy.send_event(Message::Service(event));
        })
    });
    let mut app_navigated = !is_managed;
    let mut quitting = false;

    event_loop.run(move |event, _, flow| {
        // Keep the context and OS lock alive; no shell polling at idle.
        let _keep_alive = (&context, &_profile_lock);
        *flow = ControlFlow::Wait;
        match event {
            Event::WindowEvent {
                event: WindowEvent::CloseRequested,
                ..
            } => {
                if quitting {
                    return;
                }
                if !app_navigated || !loaded.get() {
                    #[cfg(target_os = "linux")]
                    if let Some(owner) = &owner {
                        quitting = true;
                        let _ = owner.tx.send(noema_desktop::service::Control::Quit);
                        return;
                    }
                    *flow = ControlFlow::Exit;
                } else if webview.evaluate_script(include_str!("close.js")).is_err() {
                    eprintln!("Could not check unsaved work; keeping Noema open.");
                }
            }
            Event::UserEvent(Message::Close) => {
                #[cfg(target_os = "linux")]
                if let Some(owner) = &owner {
                    use gtk::prelude::*;
                    if !quitting {
                        quitting = true;
                        let _ = owner.tx.send(noema_desktop::service::Control::Quit);
                    }
                    startup.1.set_text("Stopping the owned local service…");
                    startup.2.set_sensitive(false);
                    startup.3.set_sensitive(false);
                    startup.0.show_all();
                    return;
                }
                *flow = ControlFlow::Exit;
            }
            #[cfg(target_os = "linux")]
            Event::UserEvent(Message::RequestClose) => {
                if !app_navigated {
                    if let Some(owner) = &owner {
                        use gtk::prelude::*;
                        let _ = owner.tx.send(noema_desktop::service::Control::Quit);
                        quitting = true;
                        startup.1.set_text("Cancelling managed startup…");
                        startup.2.set_sensitive(false);
                        startup.3.set_sensitive(false);
                    }
                } else if webview.evaluate_script(include_str!("close.js")).is_err() {
                    eprintln!("Could not check unsaved work; keeping Noema open.");
                }
            }
            #[cfg(target_os = "linux")]
            Event::UserEvent(Message::Retry) => {
                if !quitting {
                    if let Some(owner) = &owner {
                        let _ = owner.tx.send(noema_desktop::service::Control::Retry);
                    }
                }
            }
            #[cfg(target_os = "linux")]
            Event::UserEvent(Message::Service(event)) => {
                use gtk::prelude::*;
                use noema_desktop::service::Event as Service;
                match event {
                    Service::Starting => {
                        startup.1.set_text("Starting the managed local service…");
                        startup.2.set_sensitive(false);
                        startup.0.show_all();
                    }
                    Service::Ready(_) => {
                        startup.0.hide();
                        if !app_navigated {
                            loaded.set(false);
                            if webview.load_url(&options.server).is_ok() {
                                app_navigated = true;
                            } else {
                                startup
                                    .1
                                    .set_text("Cannot load the interface. Quit and reopen Noema.");
                                startup.2.set_sensitive(false);
                                startup.0.show_all();
                            }
                        } else {
                            let _ = webview
                                .evaluate_script("window.dispatchEvent(new Event('online'))");
                        }
                    }
                    Service::Error(error) => {
                        if app_navigated {
                            let _ = webview
                                .evaluate_script("window.dispatchEvent(new Event('offline'))");
                        }
                        startup.1.set_text(error);
                        startup.2.set_sensitive(!quitting);
                        startup.0.show_all();
                    }
                    Service::Stopped => *flow = ControlFlow::Exit,
                }
            }
            #[cfg(feature = "qa")]
            Event::UserEvent(Message::Report(report)) => {
                println!("NOEMA_WEBVIEW_QA {report}");
                if serde_json::from_str::<serde_json::Value>(&report)
                    .is_ok_and(|value| value["hold"] == true)
                {
                    return;
                }
                // QA only: allow a screenshot of the private virtual display,
                // then exercise the same draft checkpoint used on window close.
                std::thread::sleep(std::time::Duration::from_millis(1200));
                if webview.evaluate_script(include_str!("close.js")).is_err() {
                    *flow = ControlFlow::Exit;
                }
            }
            #[cfg(all(feature = "qa", target_os = "linux"))]
            Event::UserEvent(Message::QaRetry) => {
                use gtk::prelude::*;
                // Test the actual button's handler, never compiled in normal builds.
                if startup.2.is_sensitive() {
                    startup.2.emit_clicked();
                }
            }
            _ => {}
        }
    });
}

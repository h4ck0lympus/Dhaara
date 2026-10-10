//! Desktop infrastructure only. Notes/tasks/drafts belong to the original UI/service.
#[cfg(target_os = "linux")]
pub mod service;
use fs2::FileExt;
use std::{
    fs::{self, File, OpenOptions},
    net::IpAddr,
    path::{Path, PathBuf},
};
use url::Url;

pub fn validate_server(value: &str) -> Result<String, String> {
    let url = Url::parse(value).map_err(|_| "Invalid service URL")?;
    let loopback = url
        .host_str()
        .and_then(|host| host.trim_matches(['[', ']']).parse::<IpAddr>().ok())
        .is_some_and(|ip| ip.is_loopback());
    if url.scheme() != "http"
        || !loopback
        || !url.username().is_empty()
        || url.password().is_some()
        || url.path() != "/"
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("Use a literal loopback HTTP URL, e.g. http://127.0.0.1:8765".into());
    }
    Ok(url.origin().ascii_serialization())
}

pub fn same_origin(server: &str, target: &str) -> bool {
    match (Url::parse(server), Url::parse(target)) {
        (Ok(server), Ok(target)) => {
            target.username().is_empty()
                && target.password().is_none()
                && target.origin() == server.origin()
        }
        _ => false,
    }
}

pub fn download_allowed(server: &str, target: &str) -> bool {
    same_origin(server, target)
        || target
            .strip_prefix("blob:")
            .is_some_and(|url| same_origin(server, url))
}

pub fn external_link_allowed(target: &str) -> bool {
    Url::parse(target).is_ok_and(|url| {
        matches!(url.scheme(), "http" | "https")
            && url.host_str().is_some()
            && url.username().is_empty()
            && url.password().is_none()
    })
}

pub fn default_profile() -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    let base = std::env::var_os("LOCALAPPDATA").map(PathBuf::from);
    #[cfg(target_os = "macos")]
    let base = std::env::var_os("HOME")
        .map(|home| PathBuf::from(home).join("Library/Application Support"));
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let base = std::env::var_os("XDG_DATA_HOME")
        .filter(|p| Path::new(p).is_absolute())
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".local/share")));
    base.map(|path| path.join("noema/webview"))
        .ok_or("Cannot locate profile; supply --profile PATH".into())
}

/// Hold this file open for the window lifetime. The OS releases the lock on
/// exit/crash; no deleting profile data or guessing stale PID files.
pub fn lock_profile(path: &Path) -> Result<File, String> {
    if path.file_name().is_none() {
        return Err("Choose a dedicated profile directory".into());
    }
    if !path.exists() {
        fs::create_dir_all(path).map_err(|_| "Cannot create webview profile")?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(path, fs::Permissions::from_mode(0o700))
                .map_err(|_| "Cannot protect profile")?;
        }
    }
    let mut options = OpenOptions::new();
    options.create(true).read(true).write(true).truncate(false);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let file = options
        .open(path.join(".noema.lock"))
        .map_err(|_| "Cannot open webview profile lock")?;
    file.try_lock_exclusive().map_err(|_| {
        "This profile is already open. Restore its window or use a different --profile."
    })?;
    Ok(file)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn loopback_only() {
        assert_eq!(
            validate_server("http://127.0.0.1:8765/").unwrap(),
            "http://127.0.0.1:8765"
        );
        assert!(validate_server("http://[::1]:8765").is_ok());
        for url in [
            "http://localhost:8765",
            "https://127.0.0.1",
            "http://example.com",
            "http://192.168.1.1",
            "http://user:secret@127.0.0.1",
            "http://127.0.0.1/api",
            "http://127.0.0.1?x",
            "http://127.0.0.1#x",
        ] {
            assert!(validate_server(url).is_err(), "{url}");
        }
    }
    #[test]
    fn navigation_stays_in_service_origin() {
        let base = "http://127.0.0.1:8765";
        assert!(same_origin(base, "http://127.0.0.1:8765/#capture"));
        for url in [
            "http://127.0.0.1:9000/",
            "http://localhost:8765/",
            "http://127.0.0.1.evil.com:8765",
            "file:///etc/passwd",
            "javascript:alert(1)",
            "data:text/html,x",
            "http://user@127.0.0.1:8765",
        ] {
            assert!(!same_origin(base, url));
        }
    }
    #[test]
    fn only_service_downloads() {
        let base = "http://127.0.0.1:8765";
        assert!(download_allowed(base, "blob:http://127.0.0.1:8765/abcd"));
        assert!(download_allowed(base, "http://127.0.0.1:8765/api/export"));
        assert!(!download_allowed(base, "blob:https://example.com/abcd"));
        assert!(!download_allowed(base, "file:///etc/passwd"));
    }
    #[test]
    fn external_links_are_http_not_commands() {
        assert!(external_link_allowed("https://example.com/session"));
        for url in [
            "javascript:alert(1)",
            "file:///tmp/file",
            "mailto:a@b.c",
            "https://token@example.com",
            "data:text/html,x",
        ] {
            assert!(!external_link_allowed(url));
        }
    }
    #[test]
    fn profile_lock_released_without_deleting_data() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("profile");
        let first = lock_profile(&path).unwrap();
        fs::write(path.join("retained"), "draft").unwrap();
        assert!(lock_profile(&path).is_err());
        drop(first);
        let _second = lock_profile(&path).unwrap();
        assert_eq!(fs::read_to_string(path.join("retained")).unwrap(), "draft");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(path).unwrap().permissions().mode() & 0o777,
                0o700
            );
        }
    }
}

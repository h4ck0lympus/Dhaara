use std::{env, path::PathBuf};
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
}
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let profile = if let Ok(id) = env::var("NOEMA_RUN_ID") {
        if id.is_empty()
            || id.len() > 80
            || !id
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
        {
            return Err("Invalid evidence namespace".into());
        }
        root.join(".demo/evidence").join(id).join("a")
    } else {
        root.join(".demo/a")
    };
    let _lock = noema_desktop::lock_profile(&profile)?;
    let origin = noema_desktop::validate_server("http://127.0.0.1:8791")?;
    let fixture = env::var("NOEMA_FIXTURE").unwrap_or("populated".into());
    if !["populated", "empty", "waiting", "review", "offline"].contains(&fixture.as_str()) {
        return Err("Unknown fixture".into());
    }
    let mut url = url::Url::parse(&origin)?;
    url.query_pairs_mut()
        .append_pair("host", "A")
        .append_pair("fixture", &fixture)
        .append_pair("screen", &env::var("NOEMA_SCREEN").unwrap_or("Now".into()));
    if env::var("NOEMA_PANEL").as_deref() == Ok("open") {
        url.query_pairs_mut().append_pair("panel", "open");
    }
    let event_loop = EventLoopBuilder::<Message>::with_user_event().build();
    let width = env::var("NOEMA_WIDTH")
        .ok()
        .and_then(|v| v.parse::<f64>().ok())
        .unwrap_or(1158.0);
    let height = env::var("NOEMA_HEIGHT")
        .ok()
        .and_then(|v| v.parse::<f64>().ok())
        .unwrap_or(816.0);
    let window = WindowBuilder::new()
        .with_title("Noema · A · isolated demo")
        .with_inner_size(LogicalSize::new(width, height))
        .with_min_inner_size(LogicalSize::new(380.0, 540.0))
        .build(&event_loop)?;
    let mut context = WebContext::new(Some(profile));
    let proxy = event_loop.create_proxy();
    let nav_origin = origin.clone();
    let ipc_origin = origin.clone();
    let builder=WebViewBuilder::new_with_web_context(&mut context)
        .with_url(url.as_str()).with_devtools(false).with_background_color((16,20,25,255))
        .with_navigation_handler(move |target|noema_desktop::same_origin(&nav_origin,&target))
        .with_new_window_req_handler(|_,_|wry::NewWindowResponse::Deny)
        .with_download_started_handler(|_,_|false)
        .with_initialization_script("document.addEventListener('DOMContentLoaded',()=>{const report=()=>{if(window.noemaExperimentReady){window.ipc.postMessage('demo:ready:'+JSON.stringify({ua:navigator.userAgent,width:innerWidth,height:innerHeight,scale:devicePixelRatio}));}else setTimeout(report,100);};report();});")
        .with_ipc_handler(move|request|{if noema_desktop::same_origin(&ipc_origin,&request.uri().to_string()){if request.body()=="demo:close" {let _=proxy.send_event(Message::Close);}else if request.body().starts_with("demo:ready:"){println!("{}",request.body());}}});
    #[cfg(target_os = "linux")]
    let builder = builder.with_permission_handler(|_| wry::PermissionResponse::Deny);
    #[cfg(target_os = "linux")]
    let webview = {
        use tao::platform::unix::WindowExtUnix;
        use wry::WebViewBuilderExtUnix;
        builder.build_gtk(window.default_vbox().ok_or("Missing GTK container")?)?
    };
    #[cfg(not(target_os = "linux"))]
    let webview = builder.build(&window)?;
    event_loop.run(move|event,_,flow|{*flow=ControlFlow::Wait;match event {
        Event::UserEvent(Message::Close)=>*flow=ControlFlow::Exit,
        Event::WindowEvent{event:WindowEvent::CloseRequested,..}=>{let _=webview.evaluate_script("(async()=>{if(window.noemaNativeClose && await window.noemaNativeClose()) window.ipc.postMessage('demo:close');})()");},
        _=>{}
    }});
}

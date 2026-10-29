fn main() {
    // Tauri embeds the Dock/window icons in the native executable, including in dev.
    // Regenerate its context when an icon changes instead of reusing cached assets.
    println!("cargo:rerun-if-changed=icons");
    tauri_build::build()
}

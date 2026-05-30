class Openweb < Formula
  desc "Open-source browser automation daemon and MCP server for AI agents"
  homepage "https://github.com/QWKiks/openweb"
  url "https://github.com/QWKiks/openweb/archive/refs/tags/v1.6.2.tar.gz"
  sha256 "ec0c0d94cf9c324997ae9afd0acbe6a48771a2c10b919cf4e6bc34c546c16b19"
  head "https://github.com/QWKiks/openweb.git", branch: "main"

  depends_on "node"

  def install
    # Copy all files into libexec directory
    libexec.install Dir["*"]

    # Run npm install inside the libexec directory to pull node_modules dependencies
    cd libexec do
      system "npm", "install"
    end

    # Write a thin executable wrapper script inside bin/
    (bin/"openweb").write <<~EOS
      #!/usr/bin/env bash
      exec "#{Formula["node"].opt_bin}/node" "#{libexec}/cli.js" "$@"
    EOS
  end

  service do
    run ["#{Formula["node"].opt_bin}/node", "#{opt_libexec}/daemon.js"]
    keep_alive true
    log_path var/"log/openweb.log"
    error_log_path var/"log/openweb.log"
  end

  def caveats
    <<~EOS
      OpenWeb has been installed successfully!

      To complete the setup and link the browser extension:
        1. Open chrome://extensions (or edge://extensions) in your browser.
        2. Toggle "Developer mode" on (in the top right corner).
        3. Click "Load unpacked" and select this directory:
           #{opt_libexec}
        4. Click the OpenWeb icon in your toolbar and press "Connect".

      To start the OpenWeb WebSocket daemon in the background via Homebrew:
        brew services start openweb

      To run manual commands:
        openweb help
        openweb setup
        openweb doctor
    EOS
  end

  test do
    assert_match "OpenWeb — CLI", shell_output("#{bin}/openweb help")
  end
end

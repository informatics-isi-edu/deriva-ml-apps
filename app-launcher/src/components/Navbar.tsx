interface NavbarProps {
  hostname: string | null;
  selectedCatalog: string | null;
}

export function Navbar({ hostname, selectedCatalog }: NavbarProps) {
  return (
    <nav
      className="flex-shrink-0 flex items-center justify-between"
      style={{
        backgroundColor: "#000",
        minHeight: 50,
        height: 50,
        padding: "0 5px 0 20px",
      }}
    >
      {/* Left: Brand */}
      <div className="flex items-center gap-6">
        <a
          href="/"
          className="text-lg leading-5 no-underline"
          style={{
            color: "#59C4FF",
            padding: "15px",
          }}
        >
          DerivaML
        </a>

        {/* Nav links — match Chaise's navbar-menu-options */}
        <span
          className="text-sm"
          style={{ color: "#c1c1c1", padding: "15px" }}
        >
          Applications
        </span>
      </div>

      {/* Right: connection status + help */}
      <div className="flex items-center">
        {hostname && (
          <span
            className="text-sm font-mono"
            style={{ color: "#c1c1c1", padding: "15px" }}
          >
            {hostname}
            {selectedCatalog && (
              <span style={{ color: "#59C4FF" }}>
                {" "}/ {selectedCatalog}
              </span>
            )}
          </span>
        )}

        <a
          href="https://docs.derivacloud.org"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm no-underline hover:text-white transition-colors"
          style={{ color: "#c1c1c1", padding: "15px" }}
        >
          Help
        </a>
      </div>
    </nav>
  );
}

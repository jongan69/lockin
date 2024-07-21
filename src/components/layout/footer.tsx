export function Footer() {
  return (
    <footer className="footer footer-center p-4 text-base-content">
      <div>
        <p>
          {/* Created and open-sourced by{" "}
          <a
            href="https://github.com/jongan69/lockin"
            target="_blank"
            rel="noreferrer"
            className="link link-primary"
          >
            Jonathan Gan
            © 2024 - {new Date().getFullYear()}
          </a> */}
          Powered by{" "}
          <a
            href="https://dexscreener.com/solana/atwmaa6t9t8cq8xccccfpgdnnqyxhscunuy6wvri7fke"
            target="_blank"
            rel="noreferrer"
            className="link link-primary"
          >
            The Lockin Factory
          </a>
        </p>
      </div>
    </footer>
  );
}

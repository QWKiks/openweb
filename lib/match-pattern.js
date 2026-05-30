const VALID_PROTOCOLS = ["http", "https", "file", "ftp", "urn"];

export class MatchPattern {
     
                                                          
     
  constructor(pattern) {
    if (pattern === "<all_urls>") {
      this.isAllUrls = true;
      this.protocolMatches = [...VALID_PROTOCOLS];
      this.hostnameMatch = "*";
      this.pathnameMatch = "*";
    } else {
      const match = /(.*):\/\/(.*?)(\/.*)/.exec(pattern);
      if (!match) {
        throw new MatchPatternError(pattern, "Incorrect format");
      }
      const [, , protocol, host, path] = match;

      validateProtocol(pattern, protocol);
      validateHostname(pattern, host);

      this.protocolMatches = protocol === "*" ? ["http", "https"] : [protocol];
      this.hostnameMatch = host;
      this.pathnameMatch = path;
    }
  }

     
                                        
                                     
                       
     
  includes(url) {
    if (this.isAllUrls) return true;
    const parsed = typeof url === "string"
      ? new URL(url)
      : url instanceof Location ? new URL(url.href) : url;
    return !!this.protocolMatches.find((proto) => {
      if (proto === "http") return this._isHttpMatch(parsed);
      if (proto === "https") return this._isHttpsMatch(parsed);
      if (proto === "file") throw new Error("Not implemented: file:// pattern matching");
      if (proto === "ftp") throw new Error("Not implemented: ftp:// pattern matching");
      if (proto === "urn") throw new Error("Not implemented: urn:// pattern matching");
    });
  }

  _isHttpMatch(url) { return url.protocol === "http:" && this._isHostPathMatch(url); }
  _isHttpsMatch(url) { return url.protocol === "https:" && this._isHostPathMatch(url); }

  _isHostPathMatch(url) {
    if (!this.hostnameMatch || !this.pathnameMatch) return false;
    const hostPatterns = [
      this._toRegex(this.hostnameMatch),
      this._toRegex(this.hostnameMatch.replace(/^\*\./, "")),
    ];
    const pathPattern = this._toRegex(this.pathnameMatch);
    return !!hostPatterns.find((p) => p.test(url.hostname)) && pathPattern.test(url.pathname);
  }

  _toRegex(pattern) {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`^${escaped.replace(/\\\*/g, ".*")}$`);
  }
}

export class MatchPatternError extends Error {
  constructor(pattern, reason) {
    super(`Invalid match pattern "${pattern}": ${reason}`);
  }
}

function validateProtocol(pattern, protocol) {
  if (!VALID_PROTOCOLS.includes(protocol) && protocol !== "*") {
    throw new MatchPatternError(
      pattern,
      `${protocol} not a valid protocol (${VALID_PROTOCOLS.join(", ")})`
    );
  }
}

function validateHostname(pattern, hostname) {
  if (hostname.includes(":")) {
    throw new MatchPatternError(pattern, "Hostname cannot include a port");
  }
  if (hostname.includes("*") && hostname.length > 1 && !hostname.startsWith("*.")) {
    throw new MatchPatternError(
      pattern,
      "If using a wildcard (*), it must go at the start of the hostname"
    );
  }
}

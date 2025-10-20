# Security Policy

## Supported Versions

We actively support the following versions with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in @aokiapp/tlv, please report it responsibly.

### How to Report

**Please do NOT create a public GitHub issue for security vulnerabilities.**

Instead, please email security reports to:

**hello+github@aoki.app**

Include the following information in your report:

- Description of the vulnerability
- Steps to reproduce the issue
- Potential impact
- Suggested fix (if any)
- Your contact information (optional)

### Response Time

- We will acknowledge receipt of your vulnerability report within 3 business days
- We will provide a detailed response within 7 business days with assessment and timeline
- We will keep you informed of the progress toward resolving the issue

### Disclosure Policy

- We request that you do not publicly disclose the vulnerability until we have had a chance to address it
- We will coordinate with you on the disclosure timeline
- We will credit you in the security advisory (unless you prefer to remain anonymous)

## Security Best Practices

When using @aokiapp/tlv:

1. **Keep dependencies updated**: Regularly update to the latest version to receive security patches
2. **Validate input data**: Always validate TLV data from untrusted sources before parsing
3. **Use strict mode**: Enable strict mode (default) for schema validation to ensure DER compliance
4. **Limit buffer sizes**: Be aware of memory consumption when parsing large TLV structures
5. **Review examples carefully**: Our examples are for demonstration purposes; adapt them to your security requirements

## Known Security Considerations

### Buffer Handling

- The library uses ArrayBuffer and Uint8Array for binary data handling
- Large TLV structures may consume significant memory
- Consider implementing size limits for TLV data from untrusted sources

### DER Compliance

- The library enforces DER (Distinguished Encoding Rules) by default
- Indefinite length encoding (0x80) is rejected as per DER requirements
- Maximum length field size is limited to 126 bytes per BER/DER specifications

### Input Validation

- Schema validation helps prevent malformed data processing
- Unknown/unexpected tags are rejected by default
- Strict mode enforces canonical ordering for SET types

## Security Updates

Security updates will be released as:

- **Critical**: Patch version within 24 hours
- **High**: Patch version within 7 days
- **Medium**: Patch or minor version within 30 days
- **Low**: Minor or major version as appropriate

## License Implications

Please note that this software is licensed under the AokiApp Normative Application License - Tight. Security researchers are permitted to analyze the software for security purposes under the "Information Analysis" provision of the license. See [LICENSE.md](LICENSE.md) for full details.

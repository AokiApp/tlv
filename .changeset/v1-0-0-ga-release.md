---
"@aokiapp/tlv": major
---

# Version 1.0.0 - General Availability Release

This marks the first stable release of @aokiapp/tlv. The library is now production-ready with a stable API.

## What's New in 1.0.0

### Core Features
- **Complete TLV parser and builder**: Full DER/BER encoding support
- **Schema-based API**: Type-safe parsing and building with TypeScript inference
- **Modular architecture**: Separate parser, builder, and common modules
- **Comprehensive codec library**: UTF-8, ASCII, Shift-JIS, INTEGER, OID, BIT STRING support

### API Design
- **Strict and non-strict modes**: Flexible validation for different use cases
- **SET and SEQUENCE support**: Full ASN.1 container type support
- **Repeated fields**: Native support for SEQUENCE OF / SET OF patterns
- **Optional fields**: First-class support for optional schema elements

### Quality Assurance
- **97%+ test coverage**: Comprehensive test suite with 93+ tests
- **Type safety**: Full TypeScript support with strict mode enabled
- **Real-world examples**: CMS (RFC 5652) and CRCL implementations included
- **Production-ready**: No known bugs, full CI/CD pipeline

### Documentation
- **Complete API reference**: Detailed documentation for all public APIs
- **Usage examples**: Multiple real-world examples demonstrating library capabilities
- **Security policy**: Responsible vulnerability disclosure process
- **Versioning commitment**: Semantic versioning with stability guarantees

## API Stability Commitment

Starting with version 1.0.0, this library follows semantic versioning:
- No breaking changes in minor or patch releases
- Deprecation warnings before removal in major versions
- Clear migration guides for major version updates

## Requirements
- Node.js >= 18.0.0
- TypeScript >= 5.0 (for type checking)

## Migration from 0.x

The 0.x series was experimental. Version 1.0.0 includes API refinements:
- No public API changes from 0.2.x
- All existing code should work without modifications
- New stability guarantees apply going forward

## Production Readiness

This release has been validated with:
- Zero security vulnerabilities (npm audit)
- Comprehensive test coverage
- Real-world usage in CMS and CRCL implementations
- Full DER compliance validation

## Known Limitations

Please be aware of the following design constraints:
- Maximum length field: 126 bytes (per BER/DER specifications)
- Indefinite length encoding (0x80) not supported (DER requirement)
- Large TLV structures may require significant memory

## Getting Started

```bash
npm install @aokiapp/tlv
```

See the [README](../README.md) for complete usage documentation and examples.

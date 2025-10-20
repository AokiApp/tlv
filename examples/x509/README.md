# X.509 Certificate Examples

このディレクトリには、@aokiapp/tlv ライブラリを使用した X.509 電子証明書の処理例が含まれています。

This directory contains examples of X.509 certificate processing using the @aokiapp/tlv library.

## Examples

### 1. decode-certificate.ts

X.509 証明書をデコード（解析）する例です。https://aoki.app の実際の証明書を使用します。

Demonstrates how to decode (parse) an X.509 certificate using the actual certificate from https://aoki.app.

**機能 / Features:**
- DER 形式の証明書ファイルの読み込み / Read DER-formatted certificate files
- https://aoki.app の実際の証明書を使用 / Uses the actual certificate from https://aoki.app
- 証明書の構造を解析 / Parse certificate structure
- バージョン、シリアル番号、発行者、サブジェクト、有効期限などを抽出 / Extract version, serial number, issuer, subject, validity period, etc.
- 拡張フィールド（Basic Constraints、Subject Alternative Name など）の解析 / Parse extension fields (Basic Constraints, Subject Alternative Name, etc.)

**実行方法 / How to run:**
```bash
npx tsx examples/x509/decode-certificate.ts
```

**出力例 / Sample output:**
```
=== X.509 Certificate Decoding Example ===

This example decodes the actual certificate from https://aoki.app

Certificate file: .../aoki-app-cert.der
Certificate size: 917 bytes

=== Certificate Information ===

Version: v3 (2)
Serial Number: 00E4166FC8D5DA18E50D1B282941769683
Signature Algorithm: 1.2.840.10045.4.3.2
Issuer: C=US, O=Google Trust Services, CN=WE1

Validity:
  Not Before: 250825235627Z
  Not After:  251124005624Z

Subject: CN=aoki.app
...
```

### 2. issue-certificate.ts

ダミーの CA 証明書を作成し、その CA から子証明書を発行する例です。

Demonstrates creating a dummy CA certificate and issuing a child certificate from it.

**機能 / Features:**
- CA（認証局）証明書の作成 / Create CA (Certificate Authority) certificate
- CA の秘密鍵で署名された子証明書の発行 / Issue child certificate signed by CA's private key
- BasicTLVBuilder を使用した証明書構造のエンコード / Encode certificate structure using BasicTLVBuilder
- OpenSSL を使用した署名と検証 / Sign and verify using OpenSSL

**実行方法 / How to run:**
```bash
npx tsx examples/x509/issue-certificate.ts
```

**出力例 / Sample output:**
```
=== X.509 Certificate Issuance Example ===

Step 1: Creating CA certificate...
✓ CA certificate created: /tmp/x509-example/ca-cert.der
  Serial: 01
  Subject: C=JP, O=Example CA Inc., CN=Example Root CA

Step 2: Creating child certificate...
✓ Child certificate created: /tmp/x509-example/child-cert.der
  Serial: 02
  Issuer: C=JP, O=Example CA Inc., CN=Example Root CA
  Subject: C=JP, O=Example Corp., CN=example.com

Step 3: Verifying certificates...
✓ Certificate chain verification: /tmp/x509-example/child-cert.pem: OK
...
```

### 3. verify-certificate.ts

証明書チェーンの検証、CN/SAN の検証など、正統な TLS 検証を行う例です。https://aoki.app の実際の証明書を使用します。

Demonstrates proper TLS certificate chain verification, including CN/SAN validation, using the actual certificate from https://aoki.app.

**機能 / Features:**
- https://aoki.app の実際の証明書チェーンを使用 / Uses the actual certificate chain from https://aoki.app
- 証明書チェーンの解析と検証 / Parse and verify certificate chain
- 有効期限の確認 / Check validity period
- ホスト名の検証（CN および SAN） / Verify hostname (CN and SAN)
- ワイルドカード対応のホスト名マッチング / Wildcard hostname matching
- Basic Constraints（CA フラグ）の確認 / Check Basic Constraints (CA flag)
- 発行者と署名の検証 / Verify issuer and signature

**実行方法 / How to run:**
```bash
# 証明書チェーンが含まれているため、そのまま実行できます
# The certificate chain is included, so you can run it directly
npx tsx examples/x509/verify-certificate.ts

# オプション: issue-certificate.ts を実行して追加の証明書例を作成
# Optional: Run issue-certificate.ts to create additional certificate examples
npx tsx examples/x509/issue-certificate.ts
```

**出力例 / Sample output:**
```
=== X.509 Certificate Chain Verification Example ===

Test 1: Verify aoki.app certificate

Certificate: CN=aoki.app
Serial: 00e4166fc8d5da18e50d1b282941769683
Issuer: C=US, O=Google Trust Services, CN=WE1
Validity: 2025-08-25T23:56:27.000Z - 2025-11-24T00:56:24.000Z

Validity Check:
  Current time: 2025-10-20T08:23:36.774Z
  Valid period: ✓ VALID

Hostname Verification:
  aoki.app: ✓ MATCHES
  www.aoki.app: ✗ DOES NOT MATCH
  api.aoki.app: ✗ DOES NOT MATCH
...
```

## 技術詳細 / Technical Details

### X.509 Certificate Structure

X.509 証明書は ASN.1 DER 形式でエンコードされており、以下の構造を持ちます：

X.509 certificates are encoded in ASN.1 DER format with the following structure:

```asn1
Certificate ::= SEQUENCE {
  tbsCertificate       TBSCertificate,
  signatureAlgorithm   AlgorithmIdentifier,
  signatureValue       BIT STRING
}

TBSCertificate ::= SEQUENCE {
  version         [0] EXPLICIT Version DEFAULT v1,
  serialNumber         CertificateSerialNumber,
  signature            AlgorithmIdentifier,
  issuer               Name,
  validity             Validity,
  subject              Name,
  subjectPublicKeyInfo SubjectPublicKeyInfo,
  extensions      [3] EXPLICIT Extensions OPTIONAL
}
```

### 使用される TLV ライブラリの機能 / TLV Library Features Used

- **BasicTLVParser**: DER エンコードされた証明書の低レベル解析 / Low-level parsing of DER-encoded certificates
- **BasicTLVBuilder**: 証明書構造の DER エンコーディング / DER encoding of certificate structures
- **Codecs**: OID、整数、文字列、ビット文字列のエンコード/デコード / Encoding/decoding of OIDs, integers, strings, bit strings

### 参照仕様 / Reference Specifications

- RFC 5280: Internet X.509 Public Key Infrastructure Certificate and Certificate Revocation List (CRL) Profile
- RFC 6125: Representation and Verification of Domain-Based Application Service Identity within Internet Public Key Infrastructure Using X.509 (PKIX) Certificates in the Context of Transport Layer Security (TLS)

## 前提条件 / Prerequisites

これらの例を実行するには、OpenSSL がシステムにインストールされている必要があります。

OpenSSL must be installed on your system to run these examples.

```bash
# Check if OpenSSL is installed
openssl version
```

## ファイル / Files

- `decode-certificate.ts`: 証明書デコード例 / Certificate decoding example
- `issue-certificate.ts`: 証明書発行例 / Certificate issuance example
- `verify-certificate.ts`: 証明書検証例 / Certificate verification example
- `aoki-app-cert.der`: https://aoki.app の実際の証明書（DER 形式） / Actual certificate from https://aoki.app (DER format)
- `aoki-app-ca-cert.der`: https://aoki.app の CA 証明書（DER 形式） / CA certificate for https://aoki.app (DER format)
- `sample-cert.der`: 以前のサンプル証明書（DER 形式）/ Legacy sample certificate (DER format)
- `README.md`: このファイル / This file

## 注意事項 / Notes

- これらの例は教育目的であり、本番環境での使用は推奨されません / These examples are for educational purposes and not recommended for production use
- 実際の署名検証は OpenSSL を使用していますが、TLV エンコード/デコードは完全に @aokiapp/tlv ライブラリで行われています / Actual signature verification uses OpenSSL, but TLV encoding/decoding is done entirely with the @aokiapp/tlv library
- 本番環境では、適切な暗号化ライブラリ（例：Web Crypto API、Node.js crypto モジュール）を使用してください / For production use, employ proper cryptographic libraries (e.g., Web Crypto API, Node.js crypto module)

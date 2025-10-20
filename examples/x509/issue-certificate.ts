/**
 * X.509 Certificate Issuance Example
 *
 * This example demonstrates how to:
 * 1. Create a dummy CA (Certificate Authority) certificate
 * 2. Issue a child certificate signed by the CA
 *
 * This uses the @aokiapp/tlv library to encode the certificate structures.
 * Note: For simplicity, we use openssl to generate the actual cryptographic
 * signatures, but the TLV encoding/building is done entirely with this library.
 *
 * X.509 Certificate Structure (RFC 5280):
 * Certificate ::= SEQUENCE {
 *   tbsCertificate       TBSCertificate,
 *   signatureAlgorithm   AlgorithmIdentifier,
 *   signatureValue       BIT STRING
 * }
 */

import { writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { BasicTLVBuilder } from "../../src/builder/index.ts";
import {
  toArrayBuffer,
  toHex,
  encodeInteger,
  encodeOID,
  bufferToArrayBuffer,
} from "../../src/common/codecs.ts";
import { TagClass } from "../../src/common/index.ts";

// Helper function to encode a DirectoryString as UTF8String
function encodeDirectoryString(str: string): ArrayBuffer {
  return new TextEncoder().encode(str).buffer;
}

// Helper function to encode a UTCTime string
function encodeUTCTime(dateStr: string): ArrayBuffer {
  return new TextEncoder().encode(dateStr).buffer;
}

// Build an AttributeTypeAndValue
function buildAttributeTypeAndValue(
  oid: string,
  value: string,
  useUTF8 = true,
): ArrayBuffer {
  const oidBuf = encodeOID(oid);
  const valueBuf = encodeDirectoryString(value);

  // SEQUENCE { OID, UTF8String/PrintableString }
  const oidTlv = BasicTLVBuilder.build({
    tag: { tagClass: TagClass.Universal, constructed: false, tagNumber: 6 },
    length: oidBuf.byteLength,
    value: oidBuf,
    endOffset: 0,
  });

  const valueTlv = BasicTLVBuilder.build({
    tag: {
      tagClass: TagClass.Universal,
      constructed: false,
      tagNumber: useUTF8 ? 12 : 19,
    }, // UTF8String or PrintableString
    length: valueBuf.byteLength,
    value: valueBuf,
    endOffset: 0,
  });

  // Combine into SEQUENCE
  const combined = new Uint8Array(oidTlv.byteLength + valueTlv.byteLength);
  combined.set(new Uint8Array(oidTlv), 0);
  combined.set(new Uint8Array(valueTlv), oidTlv.byteLength);

  return BasicTLVBuilder.build({
    tag: { tagClass: TagClass.Universal, constructed: true, tagNumber: 16 },
    length: combined.byteLength,
    value: combined.buffer,
    endOffset: 0,
  });
}

// Build a RelativeDistinguishedName (SET OF AttributeTypeAndValue)
function buildRDN(oid: string, value: string, useUTF8 = true): ArrayBuffer {
  const attr = buildAttributeTypeAndValue(oid, value, useUTF8);
  return BasicTLVBuilder.build({
    tag: { tagClass: TagClass.Universal, constructed: true, tagNumber: 17 }, // SET
    length: attr.byteLength,
    value: attr,
    endOffset: 0,
  });
}

// Build a Name (SEQUENCE OF RelativeDistinguishedName)
function buildName(components: { oid: string; value: string; useUTF8?: boolean }[]): ArrayBuffer {
  const rdns: Uint8Array[] = [];
  for (const comp of components) {
    const rdn = buildRDN(comp.oid, comp.value, comp.useUTF8 !== false);
    rdns.push(new Uint8Array(rdn));
  }

  const totalLength = rdns.reduce((sum, rdn) => sum + rdn.byteLength, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const rdn of rdns) {
    combined.set(rdn, offset);
    offset += rdn.byteLength;
  }

  return BasicTLVBuilder.build({
    tag: { tagClass: TagClass.Universal, constructed: true, tagNumber: 16 }, // SEQUENCE
    length: combined.byteLength,
    value: combined.buffer,
    endOffset: 0,
  });
}

// Build AlgorithmIdentifier (SEQUENCE { OID, NULL })
function buildAlgorithmIdentifier(oid: string): ArrayBuffer {
  const oidBuf = encodeOID(oid);
  const oidTlv = BasicTLVBuilder.build({
    tag: { tagClass: TagClass.Universal, constructed: false, tagNumber: 6 },
    length: oidBuf.byteLength,
    value: oidBuf,
    endOffset: 0,
  });

  const nullTlv = BasicTLVBuilder.build({
    tag: { tagClass: TagClass.Universal, constructed: false, tagNumber: 5 },
    length: 0,
    value: new ArrayBuffer(0),
    endOffset: 0,
  });

  const combined = new Uint8Array(oidTlv.byteLength + nullTlv.byteLength);
  combined.set(new Uint8Array(oidTlv), 0);
  combined.set(new Uint8Array(nullTlv), oidTlv.byteLength);

  return BasicTLVBuilder.build({
    tag: { tagClass: TagClass.Universal, constructed: true, tagNumber: 16 },
    length: combined.byteLength,
    value: combined.buffer,
    endOffset: 0,
  });
}

// Build Validity (SEQUENCE { UTCTime, UTCTime })
function buildValidity(notBefore: string, notAfter: string): ArrayBuffer {
  const notBeforeBuf = encodeUTCTime(notBefore);
  const notAfterBuf = encodeUTCTime(notAfter);

  const notBeforeTlv = BasicTLVBuilder.build({
    tag: { tagClass: TagClass.Universal, constructed: false, tagNumber: 23 },
    length: notBeforeBuf.byteLength,
    value: notBeforeBuf,
    endOffset: 0,
  });

  const notAfterTlv = BasicTLVBuilder.build({
    tag: { tagClass: TagClass.Universal, constructed: false, tagNumber: 23 },
    length: notAfterBuf.byteLength,
    value: notAfterBuf,
    endOffset: 0,
  });

  const combined = new Uint8Array(
    notBeforeTlv.byteLength + notAfterTlv.byteLength,
  );
  combined.set(new Uint8Array(notBeforeTlv), 0);
  combined.set(new Uint8Array(notAfterTlv), notBeforeTlv.byteLength);

  return BasicTLVBuilder.build({
    tag: { tagClass: TagClass.Universal, constructed: true, tagNumber: 16 },
    length: combined.byteLength,
    value: combined.buffer,
    endOffset: 0,
  });
}

// Build SubjectPublicKeyInfo
function buildSubjectPublicKeyInfo(publicKeyDer: ArrayBuffer): ArrayBuffer {
  // Extract the public key from the DER format (which is already a SubjectPublicKeyInfo SEQUENCE)
  return publicKeyDer;
}

// Build Basic Constraints extension (CA:TRUE)
function buildBasicConstraintsExtension(isCA: boolean): ArrayBuffer {
  // BasicConstraints ::= SEQUENCE { cA BOOLEAN DEFAULT FALSE }
  const caBuf = new Uint8Array([isCA ? 0xff : 0x00]).buffer;
  const boolTlv = BasicTLVBuilder.build({
    tag: { tagClass: TagClass.Universal, constructed: false, tagNumber: 1 },
    length: 1,
    value: caBuf,
    endOffset: 0,
  });

  const bcSeq = BasicTLVBuilder.build({
    tag: { tagClass: TagClass.Universal, constructed: true, tagNumber: 16 },
    length: boolTlv.byteLength,
    value: boolTlv,
    endOffset: 0,
  });

  // Extension ::= SEQUENCE { extnID, critical, extnValue }
  const extnID = encodeOID("2.5.29.19"); // id-ce-basicConstraints
  const extnIDTlv = BasicTLVBuilder.build({
    tag: { tagClass: TagClass.Universal, constructed: false, tagNumber: 6 },
    length: extnID.byteLength,
    value: extnID,
    endOffset: 0,
  });

  const criticalTlv = BasicTLVBuilder.build({
    tag: { tagClass: TagClass.Universal, constructed: false, tagNumber: 1 },
    length: 1,
    value: new Uint8Array([0xff]).buffer,
    endOffset: 0,
  });

  const extnValueTlv = BasicTLVBuilder.build({
    tag: { tagClass: TagClass.Universal, constructed: false, tagNumber: 4 },
    length: bcSeq.byteLength,
    value: bcSeq,
    endOffset: 0,
  });

  const combined = new Uint8Array(
    extnIDTlv.byteLength + criticalTlv.byteLength + extnValueTlv.byteLength,
  );
  combined.set(new Uint8Array(extnIDTlv), 0);
  combined.set(new Uint8Array(criticalTlv), extnIDTlv.byteLength);
  combined.set(
    new Uint8Array(extnValueTlv),
    extnIDTlv.byteLength + criticalTlv.byteLength,
  );

  return BasicTLVBuilder.build({
    tag: { tagClass: TagClass.Universal, constructed: true, tagNumber: 16 },
    length: combined.byteLength,
    value: combined.buffer,
    endOffset: 0,
  });
}

// Build Extensions [3] EXPLICIT
function buildExtensions(extensions: ArrayBuffer[]): ArrayBuffer {
  const totalLength = extensions.reduce(
    (sum, ext) => sum + ext.byteLength,
    0,
  );
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const ext of extensions) {
    combined.set(new Uint8Array(ext), offset);
    offset += ext.byteLength;
  }

  const extSeq = BasicTLVBuilder.build({
    tag: { tagClass: TagClass.Universal, constructed: true, tagNumber: 16 },
    length: combined.byteLength,
    value: combined.buffer,
    endOffset: 0,
  });

  return BasicTLVBuilder.build({
    tag: {
      tagClass: TagClass.ContextSpecific,
      constructed: true,
      tagNumber: 3,
    },
    length: extSeq.byteLength,
    value: extSeq,
    endOffset: 0,
  });
}

// Build TBSCertificate
function buildTBSCertificate(params: {
  version: number;
  serialNumber: ArrayBuffer;
  signatureAlg: string;
  issuer: ArrayBuffer;
  validity: ArrayBuffer;
  subject: ArrayBuffer;
  subjectPublicKeyInfo: ArrayBuffer;
  extensions?: ArrayBuffer;
}): ArrayBuffer {
  const parts: Uint8Array[] = [];

  // Version [0] EXPLICIT
  const versionInt = encodeInteger(params.version);
  const versionIntTlv = BasicTLVBuilder.build({
    tag: { tagClass: TagClass.Universal, constructed: false, tagNumber: 2 },
    length: versionInt.byteLength,
    value: versionInt,
    endOffset: 0,
  });
  const versionTlv = BasicTLVBuilder.build({
    tag: {
      tagClass: TagClass.ContextSpecific,
      constructed: true,
      tagNumber: 0,
    },
    length: versionIntTlv.byteLength,
    value: versionIntTlv,
    endOffset: 0,
  });
  parts.push(new Uint8Array(versionTlv));

  // Serial Number
  const serialTlv = BasicTLVBuilder.build({
    tag: { tagClass: TagClass.Universal, constructed: false, tagNumber: 2 },
    length: params.serialNumber.byteLength,
    value: params.serialNumber,
    endOffset: 0,
  });
  parts.push(new Uint8Array(serialTlv));

  // Signature Algorithm
  const sigAlg = buildAlgorithmIdentifier(params.signatureAlg);
  parts.push(new Uint8Array(sigAlg));

  // Issuer
  parts.push(new Uint8Array(params.issuer));

  // Validity
  parts.push(new Uint8Array(params.validity));

  // Subject
  parts.push(new Uint8Array(params.subject));

  // SubjectPublicKeyInfo
  parts.push(new Uint8Array(params.subjectPublicKeyInfo));

  // Extensions (optional)
  if (params.extensions) {
    parts.push(new Uint8Array(params.extensions));
  }

  const totalLength = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    combined.set(part, offset);
    offset += part.byteLength;
  }

  return BasicTLVBuilder.build({
    tag: { tagClass: TagClass.Universal, constructed: true, tagNumber: 16 },
    length: combined.byteLength,
    value: combined.buffer,
    endOffset: 0,
  });
}

async function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const tmpDir = "/tmp/x509-example";

  console.log("=== X.509 Certificate Issuance Example ===\n");

  // Create temporary directory
  execSync(`mkdir -p ${tmpDir}`, { stdio: "pipe" });

  // Step 1: Generate CA private key and certificate
  console.log("Step 1: Creating CA certificate...");

  // Generate CA private key
  execSync(
    `openssl genrsa -out ${tmpDir}/ca-key.pem 2048 2>/dev/null`,
    { stdio: "pipe" },
  );

  // Generate CA public key
  execSync(
    `openssl rsa -in ${tmpDir}/ca-key.pem -pubout -outform DER -out ${tmpDir}/ca-pub.der 2>/dev/null`,
    { stdio: "pipe" },
  );

  // Read CA public key
  const caPubKeyDer = bufferToArrayBuffer(
    await import("fs/promises").then((fs) =>
      fs.readFile(`${tmpDir}/ca-pub.der`),
    ),
  );

  // Build CA certificate TBSCertificate
  const caName = buildName([
    { oid: "2.5.4.6", value: "JP", useUTF8: false }, // C
    { oid: "2.5.4.10", value: "Example CA Inc." }, // O
    { oid: "2.5.4.3", value: "Example Root CA" }, // CN
  ]);

  const caValidity = buildValidity("250101000000Z", "350101000000Z");

  const caSerialNumber = new Uint8Array([0x01]).buffer;

  const caExtensions = buildExtensions([
    buildBasicConstraintsExtension(true), // CA:TRUE
  ]);

  const caTBS = buildTBSCertificate({
    version: 2, // v3
    serialNumber: caSerialNumber,
    signatureAlg: "1.2.840.113549.1.1.11", // sha256WithRSAEncryption
    issuer: caName,
    validity: caValidity,
    subject: caName, // Self-signed
    subjectPublicKeyInfo: caPubKeyDer,
    extensions: caExtensions,
  });

  // Save TBS for signing
  await writeFile(`${tmpDir}/ca-tbs.der`, new Uint8Array(caTBS));

  // Sign the TBS certificate with CA private key
  execSync(
    `openssl dgst -sha256 -sign ${tmpDir}/ca-key.pem -out ${tmpDir}/ca-sig.bin ${tmpDir}/ca-tbs.der`,
    { stdio: "pipe" },
  );

  const caSignature = bufferToArrayBuffer(
    await import("fs/promises").then((fs) =>
      fs.readFile(`${tmpDir}/ca-sig.bin`),
    ),
  );

  // Build CA certificate
  const caSignatureAlg = buildAlgorithmIdentifier("1.2.840.113549.1.1.11");

  // BIT STRING with signature
  const caSignatureBitString = BasicTLVBuilder.build({
    tag: { tagClass: TagClass.Universal, constructed: false, tagNumber: 3 },
    length: caSignature.byteLength + 1,
    value: (() => {
      const buf = new Uint8Array(caSignature.byteLength + 1);
      buf[0] = 0; // unused bits
      buf.set(new Uint8Array(caSignature), 1);
      return buf.buffer;
    })(),
    endOffset: 0,
  });

  const caCertParts = new Uint8Array(
    caTBS.byteLength +
      caSignatureAlg.byteLength +
      caSignatureBitString.byteLength,
  );
  caCertParts.set(new Uint8Array(caTBS), 0);
  caCertParts.set(new Uint8Array(caSignatureAlg), caTBS.byteLength);
  caCertParts.set(
    new Uint8Array(caSignatureBitString),
    caTBS.byteLength + caSignatureAlg.byteLength,
  );

  const caCert = BasicTLVBuilder.build({
    tag: { tagClass: TagClass.Universal, constructed: true, tagNumber: 16 },
    length: caCertParts.byteLength,
    value: caCertParts.buffer,
    endOffset: 0,
  });

  await writeFile(`${tmpDir}/ca-cert.der`, new Uint8Array(caCert));

  console.log(`✓ CA certificate created: ${tmpDir}/ca-cert.der`);
  console.log(`  Serial: ${toHex(caSerialNumber)}`);
  console.log(`  Subject: C=JP, O=Example CA Inc., CN=Example Root CA\n`);

  // Step 2: Generate child certificate
  console.log("Step 2: Creating child certificate...");

  // Generate child private key
  execSync(
    `openssl genrsa -out ${tmpDir}/child-key.pem 2048 2>/dev/null`,
    { stdio: "pipe" },
  );

  // Generate child public key
  execSync(
    `openssl rsa -in ${tmpDir}/child-key.pem -pubout -outform DER -out ${tmpDir}/child-pub.der 2>/dev/null`,
    { stdio: "pipe" },
  );

  const childPubKeyDer = bufferToArrayBuffer(
    await import("fs/promises").then((fs) =>
      fs.readFile(`${tmpDir}/child-pub.der`),
    ),
  );

  // Build child certificate TBSCertificate
  const childName = buildName([
    { oid: "2.5.4.6", value: "JP", useUTF8: false }, // C
    { oid: "2.5.4.10", value: "Example Corp." }, // O
    { oid: "2.5.4.3", value: "example.com" }, // CN
  ]);

  const childValidity = buildValidity("250101000000Z", "260101000000Z");

  const childSerialNumber = new Uint8Array([0x02]).buffer;

  const childExtensions = buildExtensions([
    buildBasicConstraintsExtension(false), // CA:FALSE
  ]);

  const childTBS = buildTBSCertificate({
    version: 2, // v3
    serialNumber: childSerialNumber,
    signatureAlg: "1.2.840.113549.1.1.11", // sha256WithRSAEncryption
    issuer: caName, // Issued by CA
    validity: childValidity,
    subject: childName,
    subjectPublicKeyInfo: childPubKeyDer,
    extensions: childExtensions,
  });

  await writeFile(`${tmpDir}/child-tbs.der`, new Uint8Array(childTBS));

  // Sign the child TBS certificate with CA private key
  execSync(
    `openssl dgst -sha256 -sign ${tmpDir}/ca-key.pem -out ${tmpDir}/child-sig.bin ${tmpDir}/child-tbs.der`,
    { stdio: "pipe" },
  );

  const childSignature = bufferToArrayBuffer(
    await import("fs/promises").then((fs) =>
      fs.readFile(`${tmpDir}/child-sig.bin`),
    ),
  );

  // Build child certificate
  const childSignatureAlg = buildAlgorithmIdentifier("1.2.840.113549.1.1.11");

  const childSignatureBitString = BasicTLVBuilder.build({
    tag: { tagClass: TagClass.Universal, constructed: false, tagNumber: 3 },
    length: childSignature.byteLength + 1,
    value: (() => {
      const buf = new Uint8Array(childSignature.byteLength + 1);
      buf[0] = 0; // unused bits
      buf.set(new Uint8Array(childSignature), 1);
      return buf.buffer;
    })(),
    endOffset: 0,
  });

  const childCertParts = new Uint8Array(
    childTBS.byteLength +
      childSignatureAlg.byteLength +
      childSignatureBitString.byteLength,
  );
  childCertParts.set(new Uint8Array(childTBS), 0);
  childCertParts.set(new Uint8Array(childSignatureAlg), childTBS.byteLength);
  childCertParts.set(
    new Uint8Array(childSignatureBitString),
    childTBS.byteLength + childSignatureAlg.byteLength,
  );

  const childCert = BasicTLVBuilder.build({
    tag: { tagClass: TagClass.Universal, constructed: true, tagNumber: 16 },
    length: childCertParts.byteLength,
    value: childCertParts.buffer,
    endOffset: 0,
  });

  await writeFile(`${tmpDir}/child-cert.der`, new Uint8Array(childCert));

  console.log(`✓ Child certificate created: ${tmpDir}/child-cert.der`);
  console.log(`  Serial: ${toHex(childSerialNumber)}`);
  console.log(`  Issuer: C=JP, O=Example CA Inc., CN=Example Root CA`);
  console.log(`  Subject: C=JP, O=Example Corp., CN=example.com\n`);

  // Verify the certificates using openssl
  console.log("Step 3: Verifying certificates...");

  try {
    // Convert DER to PEM for verification
    execSync(
      `openssl x509 -inform DER -in ${tmpDir}/ca-cert.der -outform PEM -out ${tmpDir}/ca-cert.pem`,
      { stdio: "pipe" },
    );
    execSync(
      `openssl x509 -inform DER -in ${tmpDir}/child-cert.der -outform PEM -out ${tmpDir}/child-cert.pem`,
      { stdio: "pipe" },
    );

    // Verify child certificate against CA
    const verifyOutput = execSync(
      `openssl verify -CAfile ${tmpDir}/ca-cert.pem ${tmpDir}/child-cert.pem`,
      { encoding: "utf-8", stdio: "pipe" },
    );

    console.log(`✓ Certificate chain verification: ${verifyOutput.trim()}\n`);
  } catch (error) {
    console.error("✗ Certificate verification failed");
  }

  console.log("=== Certificate Issuance Complete ===");
  console.log(`\nCertificates saved to: ${tmpDir}/`);
  console.log(`  - ca-cert.der: CA certificate`);
  console.log(`  - child-cert.der: Child certificate signed by CA`);
}

main().catch((err) => {
  console.error("Failed to create certificates:", err);
  process.exit(1);
});

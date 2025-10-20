/**
 * X.509 Certificate Decoding Example
 *
 * This example demonstrates how to parse and decode a real X.509 certificate
 * downloaded from https://aoki.app using the @aokiapp/tlv library.
 *
 * X.509 Certificate Structure (RFC 5280):
 * Certificate ::= SEQUENCE {
 *   tbsCertificate       TBSCertificate,
 *   signatureAlgorithm   AlgorithmIdentifier,
 *   signatureValue       BIT STRING
 * }
 *
 * TBSCertificate ::= SEQUENCE {
 *   version         [0] EXPLICIT Version DEFAULT v1,
 *   serialNumber         CertificateSerialNumber,
 *   signature            AlgorithmIdentifier,
 *   issuer               Name,
 *   validity             Validity,
 *   subject              Name,
 *   subjectPublicKeyInfo SubjectPublicKeyInfo,
 *   extensions      [3] EXPLICIT Extensions OPTIONAL
 * }
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { BasicTLVParser } from "../../src/parser/index.ts";
import {
  bufferToArrayBuffer,
  toHex,
  decodeInteger,
  decodeOID,
  decodeBitStringHex,
  decodeUtf8,
} from "../../src/common/codecs.ts";

// Helper to decode directory strings (handles both UTF8String and PrintableString)
function decodeDirectoryString(value: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(value);
  } catch {
    return new TextDecoder("ascii").decode(value);
  }
}

// Parse Name (SEQUENCE OF RelativeDistinguishedName)
function parseName(buffer: ArrayBuffer): string {
  const nameSeq = BasicTLVParser.parse(buffer);
  const parts: string[] = [];

  const oidNames: Record<string, string> = {
    "2.5.4.3": "CN",
    "2.5.4.6": "C",
    "2.5.4.7": "L",
    "2.5.4.8": "ST",
    "2.5.4.10": "O",
    "2.5.4.11": "OU",
  };

  let offset = 0;
  while (offset < nameSeq.value.byteLength) {
    const rdnSet = BasicTLVParser.parse(
      nameSeq.value.slice(offset, nameSeq.value.byteLength),
    );

    let innerOffset = 0;
    while (innerOffset < rdnSet.value.byteLength) {
      const attrSeq = BasicTLVParser.parse(
        rdnSet.value.slice(innerOffset, rdnSet.value.byteLength),
      );

      // Parse OID
      const oid = BasicTLVParser.parse(attrSeq.value);
      const oidStr = decodeOID(oid.value);

      // Parse value
      const valueField = BasicTLVParser.parse(
        attrSeq.value.slice(oid.endOffset, attrSeq.value.byteLength),
      );
      const valueStr = decodeDirectoryString(valueField.value);

      const name = oidNames[oidStr] || oidStr;
      parts.push(`${name}=${valueStr}`);

      innerOffset += attrSeq.endOffset;
    }

    offset += rdnSet.endOffset;
  }

  return parts.join(", ");
}

// Parse AlgorithmIdentifier
function parseAlgorithmIdentifier(buffer: ArrayBuffer): {
  algorithm: string;
  parameters: string | null;
} {
  const algSeq = BasicTLVParser.parse(buffer);

  const oid = BasicTLVParser.parse(algSeq.value);
  const algorithm = decodeOID(oid.value);

  let parameters = null;
  if (oid.endOffset < algSeq.value.byteLength) {
    const params = BasicTLVParser.parse(
      algSeq.value.slice(oid.endOffset, algSeq.value.byteLength),
    );
    if (params.length > 0) {
      parameters = toHex(params.value);
    }
  }

  return { algorithm, parameters };
}

// Parse Extension
interface Extension {
  extnID: string;
  critical: boolean;
  extnValue: string;
}

function parseExtensions(buffer: ArrayBuffer): Extension[] {
  const extensions: Extension[] = [];
  const extWrapper = BasicTLVParser.parse(buffer); // Context [3]
  const extSeq = BasicTLVParser.parse(extWrapper.value); // SEQUENCE

  let offset = 0;
  while (offset < extSeq.value.byteLength) {
    const ext = BasicTLVParser.parse(
      extSeq.value.slice(offset, extSeq.value.byteLength),
    );

    let innerOffset = 0;
    // Parse extnID (OID)
    const oidTlv = BasicTLVParser.parse(ext.value);
    const extnID = decodeOID(oidTlv.value);
    innerOffset = oidTlv.endOffset;

    // Parse optional critical BOOLEAN
    let critical = false;
    let nextTlv = BasicTLVParser.parse(
      ext.value.slice(innerOffset, ext.value.byteLength),
    );
    if (nextTlv.tag.tagNumber === 1) {
      // BOOLEAN
      critical = new Uint8Array(nextTlv.value)[0] !== 0;
      innerOffset += nextTlv.endOffset;
      nextTlv = BasicTLVParser.parse(
        ext.value.slice(innerOffset, ext.value.byteLength),
      );
    }

    // Parse extnValue (OCTET STRING)
    const extnValue = toHex(nextTlv.value);

    extensions.push({ extnID, critical, extnValue });
    offset += ext.endOffset;
  }

  return extensions;
}

async function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // Use the actual certificate from https://aoki.app
  const certPath = path.resolve(__dirname, "aoki-app-cert.der");

  console.log("=== X.509 Certificate Decoding Example ===\n");
  console.log("This example decodes the actual certificate from https://aoki.app\n");

  // Read the DER-encoded certificate file
  const derFile = await readFile(certPath);
  const derBuffer = bufferToArrayBuffer(derFile);

  console.log(`Certificate file: ${certPath}`);
  console.log(`Certificate size: ${derBuffer.byteLength} bytes\n`);

  // Parse the top-level certificate SEQUENCE
  const cert = BasicTLVParser.parse(derBuffer);

  let offset = 0;

  // 1. Parse TBSCertificate
  const tbs = BasicTLVParser.parse(cert.value);
  offset += tbs.endOffset;

  let tbsOffset = 0;

  // Parse version [0] EXPLICIT (optional)
  let versionTlv = BasicTLVParser.parse(tbs.value);
  let version = 0; // Default v1
  if (
    versionTlv.tag.tagClass === 2 &&
    versionTlv.tag.tagNumber === 0 &&
    versionTlv.tag.constructed
  ) {
    const versionInt = BasicTLVParser.parse(versionTlv.value);
    version = decodeInteger(versionInt.value);
    tbsOffset += versionTlv.endOffset;
    versionTlv = BasicTLVParser.parse(
      tbs.value.slice(tbsOffset, tbs.value.byteLength),
    );
  }

  // Parse serialNumber
  const serialNumber = toHex(versionTlv.value);
  tbsOffset += versionTlv.endOffset;

  // Parse signature AlgorithmIdentifier
  const signatureAlgTlv = BasicTLVParser.parse(
    tbs.value.slice(tbsOffset, tbs.value.byteLength),
  );
  const signatureAlg = parseAlgorithmIdentifier(
    tbs.value.slice(tbsOffset, tbsOffset + signatureAlgTlv.endOffset),
  );
  tbsOffset += signatureAlgTlv.endOffset;

  // Parse issuer Name
  const issuerTlv = BasicTLVParser.parse(
    tbs.value.slice(tbsOffset, tbs.value.byteLength),
  );
  const issuer = parseName(
    tbs.value.slice(tbsOffset, tbsOffset + issuerTlv.endOffset),
  );
  tbsOffset += issuerTlv.endOffset;

  // Parse validity
  const validityTlv = BasicTLVParser.parse(
    tbs.value.slice(tbsOffset, tbs.value.byteLength),
  );
  const notBeforeTlv = BasicTLVParser.parse(validityTlv.value);
  const notBefore = decodeUtf8(notBeforeTlv.value);
  const notAfterTlv = BasicTLVParser.parse(
    validityTlv.value.slice(
      notBeforeTlv.endOffset,
      validityTlv.value.byteLength,
    ),
  );
  const notAfter = decodeUtf8(notAfterTlv.value);
  tbsOffset += validityTlv.endOffset;

  // Parse subject Name
  const subjectTlv = BasicTLVParser.parse(
    tbs.value.slice(tbsOffset, tbs.value.byteLength),
  );
  const subject = parseName(
    tbs.value.slice(tbsOffset, tbsOffset + subjectTlv.endOffset),
  );
  tbsOffset += subjectTlv.endOffset;

  // Parse subjectPublicKeyInfo
  const spkiTlv = BasicTLVParser.parse(
    tbs.value.slice(tbsOffset, tbs.value.byteLength),
  );
  const spkiAlg = parseAlgorithmIdentifier(spkiTlv.value);
  const spkiAlgTlv = BasicTLVParser.parse(spkiTlv.value);
  const spkiKeyTlv = BasicTLVParser.parse(
    spkiTlv.value.slice(spkiAlgTlv.endOffset, spkiTlv.value.byteLength),
  );
  const spkiKey = decodeBitStringHex(spkiKeyTlv.value);
  tbsOffset += spkiTlv.endOffset;

  // Parse extensions [3] EXPLICIT (optional)
  let extensions: Extension[] = [];
  if (tbsOffset < tbs.value.byteLength) {
    const extTlv = BasicTLVParser.parse(
      tbs.value.slice(tbsOffset, tbs.value.byteLength),
    );
    if (
      extTlv.tag.tagClass === 2 &&
      extTlv.tag.tagNumber === 3 &&
      extTlv.tag.constructed
    ) {
      extensions = parseExtensions(
        tbs.value.slice(tbsOffset, tbsOffset + extTlv.endOffset),
      );
    }
  }

  // 2. Parse signatureAlgorithm
  const certSigAlgTlv = BasicTLVParser.parse(
    cert.value.slice(offset, cert.value.byteLength),
  );
  const certSigAlg = parseAlgorithmIdentifier(
    cert.value.slice(offset, offset + certSigAlgTlv.endOffset),
  );
  offset += certSigAlgTlv.endOffset;

  // 3. Parse signatureValue
  const sigValueTlv = BasicTLVParser.parse(
    cert.value.slice(offset, cert.value.byteLength),
  );
  const sigValue = decodeBitStringHex(sigValueTlv.value);

  // Display certificate information
  console.log("=== Certificate Information ===\n");
  console.log(`Version: v${version + 1} (${version})`);
  console.log(`Serial Number: ${serialNumber.toUpperCase()}`);
  console.log(`Signature Algorithm: ${signatureAlg.algorithm}`);
  console.log(`Issuer: ${issuer}`);
  console.log("\nValidity:");
  console.log(`  Not Before: ${notBefore}`);
  console.log(`  Not After:  ${notAfter}`);
  console.log(`\nSubject: ${subject}`);
  console.log(`\nPublic Key Algorithm: ${spkiAlg.algorithm}`);
  console.log(`Public Key: ${spkiKey.hex.substring(0, 64)}...`);

  if (extensions.length > 0) {
    console.log("\n=== Extensions ===");
    console.log(`Number of extensions: ${extensions.length}\n`);

    const extensionNames: Record<string, string> = {
      "2.5.29.14": "Subject Key Identifier",
      "2.5.29.15": "Key Usage",
      "2.5.29.17": "Subject Alternative Name",
      "2.5.29.19": "Basic Constraints",
      "2.5.29.35": "Authority Key Identifier",
    };

    for (const ext of extensions) {
      const name = extensionNames[ext.extnID] || ext.extnID;
      const critical = ext.critical ? " (Critical)" : "";
      console.log(`${name}${critical}:`);
      console.log(`  OID: ${ext.extnID}`);
      console.log(`  Value (hex): ${ext.extnValue.substring(0, 64)}...`);
      console.log();
    }
  }

  console.log("=== Signature ===");
  console.log(`Algorithm: ${certSigAlg.algorithm}`);
  console.log(`Signature (hex): ${sigValue.hex.substring(0, 64)}...`);

  console.log("\n=== Decoding Complete ===");
}

main().catch((err) => {
  console.error("Failed to decode certificate:", err);
  process.exit(1);
});

import {
  Schema as ParseSchema,
  SchemaParser,
  TagClass,
} from "../../../src/parser/index.ts";
import {
  Schema as BuildSchema,
  SchemaBuilder,
} from "../../../src/builder/index.ts";
import { BasicTLVParser } from "../../../src/parser/basic-parser.ts";
import {
  decodeBitStringHex,
  decodeBoolean,
  decodeInteger,
  decodeAscii,
  encodeBoolean,
  encodeInteger,
  encodeOID,
  decodeOID,
  hexToBytes,
  toArrayBuffer,
  toHex,
} from "./common.ts";
import { encodeBitString } from "../../../src/common/codecs.ts";
import { createParseSchema } from "./parser.ts";

export type KeyUsageFlags = {
  digitalSignature?: boolean;
  contentCommitment?: boolean;
  keyEncipherment?: boolean;
  dataEncipherment?: boolean;
  keyAgreement?: boolean;
  keyCertSign?: boolean;
  cRLSign?: boolean;
  encipherOnly?: boolean;
  decipherOnly?: boolean;
};

export type GeneralName =
  | { type: "rfc822Name"; value: string }
  | { type: "dNSName"; value: string }
  | { type: "uniformResourceIdentifier"; value: string }
  | { type: "iPAddress"; hex: string }
  | { type: "registeredID"; oid: string }
  | { type: "other"; tagNumber: number; hex: string };

export type PolicyQualifier =
  | { kind: "cpsUri"; uri: string }
  | { kind: "userNotice"; hex: string }
  | {
      kind: "raw";
      tagNumber: number;
      constructed: boolean;
      tagClass: TagClass;
      hex: string;
    };

export type PolicyQualifierInfoMeaning = {
  policyQualifierId: string;
  qualifier?: PolicyQualifier;
};

export type PolicyInformationMeaning = {
  policyIdentifier: string;
  policyQualifiers?: PolicyQualifierInfoMeaning[];
};

export type AccessDescriptionMeaning = {
  accessMethod: string;
  accessLocation: GeneralName;
};

export type DistributionPointMeaning = {
  fullName?: GeneralName[];
  hex: string;
};

export type PolicyMappingPair = {
  issuerDomainPolicy: string;
  subjectDomainPolicy: string;
};


export type ExtensionMeaning =
  | { kind: "keyUsage"; extnID: "2.5.29.15"; flags: KeyUsageFlags }
  | {
      kind: "basicConstraints";
      extnID: "2.5.29.19";
      cA?: boolean;
      pathLenConstraint?: number;
    }
  | { kind: "extendedKeyUsage"; extnID: "2.5.29.37"; keyPurposes: string[] }
  | {
      kind: "subjectAltName";
      extnID: "2.5.29.17";
      names: GeneralName[];
    }
  | {
      kind: "issuerAltName";
      extnID: "2.5.29.18";
      names: GeneralName[];
    }
  | {
      kind: "certificatePolicies";
      extnID: "2.5.29.32";
      policies: PolicyInformationMeaning[];
    }
  | {
      kind: "policyMappings";
      extnID: "2.5.29.33";
      mappings: PolicyMappingPair[];
    }
  | {
      kind: "policyConstraints";
      extnID: "2.5.29.36";
      requireExplicitPolicy?: number;
      inhibitPolicyMapping?: number;
    }
  | {
      kind: "inhibitAnyPolicy";
      extnID: "2.5.29.54";
      skipCerts: number;
    }
  | {
      kind: "nameConstraints";
      extnID: "2.5.29.30";
      permitted?: GeneralName[];
      excluded?: GeneralName[];
    }
  | {
      kind: "subjectKeyIdentifier";
      extnID: "2.5.29.14";
      keyIdentifierHex: string;
    }
  | {
      kind: "authorityKeyIdentifier";
      extnID: "2.5.29.35";
      keyIdentifierHex?: string;
      authorityCertIssuer?: GeneralName[];
      authorityCertSerialNumberHex?: string;
    }
  | {
      kind: "authorityInfoAccess";
      extnID: "1.3.6.1.5.5.7.1.1";
      descriptions: AccessDescriptionMeaning[];
    }
  | {
      kind: "subjectInfoAccess";
      extnID: "1.3.6.1.5.5.7.1.11";
      descriptions: AccessDescriptionMeaning[];
    }
  | {
      kind: "cRLDistributionPoints";
      extnID: "2.5.29.31";
      distributionPoints: DistributionPointMeaning[];
    }
  | {
      kind: "freshestCRL";
      extnID: "2.5.29.46";
      distributionPoints: DistributionPointMeaning[];
    }
  | {
      kind: "certificateIssuer";
      extnID: "2.5.29.29";
      names: GeneralName[];
    }
  | {
      kind: "ctSCTs";
      extnID: "1.3.6.1.4.1.11129.2.4.2";
      sctListHex: string;
    }
  | { kind: "unknown"; extnID: string; value: { hex: string } };

function innerDERFromOctetHex(hex: string): ArrayBuffer {
  return toArrayBuffer(hexToBytes(hex));
}

function flagsFromBitString(
  unusedBits: number,
  dataHex: string,
): KeyUsageFlags {
  const bytes = hexToBytes(dataHex);
  const isSet = (bitIndex: number): boolean => {
    const byte = Math.floor(bitIndex / 8);
    const bit = 7 - (bitIndex % 8);
    if (byte >= bytes.length) return false;
    return (bytes[byte] & (1 << bit)) !== 0;
  };
  return {
    digitalSignature: isSet(0) || undefined,
    contentCommitment: isSet(1) || undefined,
    keyEncipherment: isSet(2) || undefined,
    dataEncipherment: isSet(3) || undefined,
    keyAgreement: isSet(4) || undefined,
    keyCertSign: isSet(5) || undefined,
    cRLSign: isSet(6) || undefined,
    encipherOnly: isSet(7) || undefined,
    decipherOnly: isSet(8) || undefined,
  };
}

function bitStringFromFlags(flags: KeyUsageFlags): {
  unusedBits: number;
  data: Uint8Array;
} {
  const order: (keyof KeyUsageFlags)[] = [
    "digitalSignature",
    "contentCommitment",
    "keyEncipherment",
    "dataEncipherment",
    "keyAgreement",
    "keyCertSign",
    "cRLSign",
    "encipherOnly",
    "decipherOnly",
  ];
  let highest = -1;
  for (let i = 0; i < order.length; i++) {
    if (flags[order[i]] === true) highest = i;
  }
  const bitCount = highest + 1;
  const byteLen = bitCount > 0 ? Math.ceil(bitCount / 8) : 0;
  const data = new Uint8Array(byteLen);
  for (let i = 0; i < order.length; i++) {
    if (flags[order[i]] !== true) continue;
    const byte = Math.floor(i / 8);
    const bit = 7 - (i % 8);
    if (byte < data.length) data[byte] |= 1 << bit;
  }
  const mod = bitCount % 8;
  const unusedBits = bitCount === 0 ? 0 : mod === 0 ? 0 : 8 - mod;
  return { unusedBits, data };
}

function getKeyUsageParseSchema() {
  return ParseSchema.primitive("value", { tagNumber: 3 }, decodeBitStringHex);
}

function getKeyUsageBuildSchema() {
  return BuildSchema.primitive(
    "value",
    { tagNumber: 3 },
    (f: KeyUsageFlags) => {
      const { unusedBits, data } = bitStringFromFlags(f);
      return encodeBitString({ unusedBits, data });
    },
  );
}

function getBasicConstraintsParseSchema() {
  return ParseSchema.constructed("value", { tagNumber: 16 }, [
    ParseSchema.primitive(
      "cA",
      { tagNumber: 1, optional: true },
      decodeBoolean,
    ),
    ParseSchema.primitive(
      "pathLenConstraint",
      { tagNumber: 2, optional: true },
      decodeInteger,
    ),
  ]);
}

function interpretKeyUsage(extnValueHex: string): ExtensionMeaning {
  const parser = new SchemaParser(getKeyUsageParseSchema(), { strict: true });
  const v = parser.parse(innerDERFromOctetHex(extnValueHex));
  const ub = v.unusedBits;
  const hx = v.hex;
  const flags = flagsFromBitString(ub, hx);
  return { kind: "keyUsage", extnID: "2.5.29.15", flags };
}

function interpretBasicConstraints(extnValueHex: string): ExtensionMeaning {
  const parser = new SchemaParser(getBasicConstraintsParseSchema(), {
    strict: true,
  });
  const v = parser.parse(innerDERFromOctetHex(extnValueHex));
  const out: { cA?: boolean; pathLenConstraint?: number } = {};
  if (typeof v.cA === "boolean") out.cA = v.cA;
  if (typeof v.pathLenConstraint === "number")
    out.pathLenConstraint = v.pathLenConstraint;
  return { kind: "basicConstraints", extnID: "2.5.29.19", ...out };
}

function getExtendedKeyUsageParseSchema() {
  return ParseSchema.constructed("value", { tagNumber: 16 }, [
    ParseSchema.repeated(
      "keyPurposeIds",
      {},
      ParseSchema.primitive("oid", { tagNumber: 6 }, decodeOID),
    ),
  ]);
}

function interpretExtendedKeyUsage(extnValueHex: string): ExtensionMeaning {
  const parser = new SchemaParser(getExtendedKeyUsageParseSchema(), {
    strict: true,
  });
  const v = parser.parse(innerDERFromOctetHex(extnValueHex));
  const kps = v.keyPurposeIds;
  return {
    kind: "extendedKeyUsage",
    extnID: "2.5.29.37",
    keyPurposes: kps,
  };
}

function interpretSubjectAltName(extnValueHex: string): ExtensionMeaning {
  const inner = innerDERFromOctetHex(extnValueHex);
  const seq = BasicTLVParser.parse(inner);
  let body = seq.value;
  if (
    seq.tag.tagClass !== TagClass.Universal ||
    seq.tag.tagNumber !== 16 ||
    !seq.tag.constructed
  ) {
    body = inner;
  }
  const names: GeneralName[] = [];
  let offset = 0;
  while (offset < body.byteLength) {
    const slice = body.slice(offset);
    const child = BasicTLVParser.parse(slice);
    const t = child.tag;
    if (t.tagClass === TagClass.ContextSpecific) {
      if (!t.constructed) {
        switch (t.tagNumber) {
          case 1:
            names.push({ type: "rfc822Name", value: decodeAscii(child.value) });
            break;
          case 2:
            names.push({ type: "dNSName", value: decodeAscii(child.value) });
            break;
          case 6:
            names.push({
              type: "uniformResourceIdentifier",
              value: decodeAscii(child.value),
            });
            break;
          case 7:
            names.push({ type: "iPAddress", hex: toHex(child.value) });
            break;
          case 8:
            names.push({ type: "registeredID", oid: decodeOID(child.value) });
            break;
          default:
            names.push({
              type: "other",
              tagNumber: t.tagNumber,
              hex: toHex(child.value),
            });
        }
      } else {
        names.push({
          type: "other",
          tagNumber: t.tagNumber,
          hex: toHex(child.value),
        });
      }
    } else {
      names.push({
        type: "other",
        tagNumber: t.tagNumber,
        hex: toHex(child.value),
      });
    }
    offset += child.endOffset;
  }
  return {
    kind: "subjectAltName",
    extnID: "2.5.29.17",
    names,
  };
}

/** Helper: parse a single GeneralName from a TLV child */
function parseOneGeneralName(child: any): GeneralName {
  const t = child.tag;
  if (t.tagClass === TagClass.ContextSpecific) {
    if (!t.constructed) {
      switch (t.tagNumber) {
        case 1:
          return { type: "rfc822Name", value: decodeAscii(child.value) };
        case 2:
          return { type: "dNSName", value: decodeAscii(child.value) };
        case 6:
          return {
            type: "uniformResourceIdentifier",
            value: decodeAscii(child.value),
          };
        case 7:
          return { type: "iPAddress", hex: toHex(child.value) };
        case 8:
          return { type: "registeredID", oid: decodeOID(child.value) };
        default:
          return {
            type: "other",
            tagNumber: t.tagNumber,
            hex: toHex(child.value),
          };
      }
    } else {
      return {
        type: "other",
        tagNumber: t.tagNumber,
        hex: toHex(child.value),
      };
    }
  }
  return {
    type: "other",
    tagNumber: t.tagNumber,
    hex: toHex(child.value),
  };
}

/** Helper: parse GeneralNames (SEQUENCE OF GeneralName) from a body buffer */
function parseGeneralNamesFromBody(body: ArrayBuffer): GeneralName[] {
  const names: GeneralName[] = [];
  let offset = 0;
  while (offset < body.byteLength) {
    const slice = body.slice(offset);
    const child = BasicTLVParser.parse(slice);
    names.push(parseOneGeneralName(child));
    offset += child.endOffset;
  }
  return names;
}

function interpretSubjectKeyIdentifier(extnValueHex: string): ExtensionMeaning {
  const inner = innerDERFromOctetHex(extnValueHex);
  const child = BasicTLVParser.parse(inner);
  let keyHex: string;
  if (
    child.tag.tagClass === TagClass.Universal &&
    child.tag.tagNumber === 4 &&
    !child.tag.constructed
  ) {
    keyHex = toHex(child.value);
  } else {
    keyHex = toHex(inner);
  }
  return {
    kind: "subjectKeyIdentifier",
    extnID: "2.5.29.14",
    keyIdentifierHex: keyHex,
  };
}

function interpretAuthorityKeyIdentifier(
  extnValueHex: string,
): ExtensionMeaning {
  const inner = innerDERFromOctetHex(extnValueHex);
  const root = BasicTLVParser.parse(inner);
  let body = root.value;
  if (
    root.tag.tagClass !== TagClass.Universal ||
    root.tag.tagNumber !== 16 ||
    !root.tag.constructed
  ) {
    body = inner;
  }

  let keyIdentifierHex: string | undefined;
  let authorityCertIssuer: GeneralName[] | undefined;
  let authorityCertSerialNumberHex: string | undefined;

  let off = 0;
  while (off < body.byteLength) {
    const slice = body.slice(off);
    const child = BasicTLVParser.parse(slice);
    const t = child.tag;
    if (t.tagClass === TagClass.ContextSpecific) {
      switch (t.tagNumber) {
        case 0: {
          // keyIdentifier [0] OCTET STRING
          keyIdentifierHex = toHex(child.value);
          break;
        }
        case 1: {
          // authorityCertIssuer [1] GeneralNames
          const names = parseGeneralNamesFromBody(child.value);
          if (names.length > 0) authorityCertIssuer = names;
          break;
        }
        case 2: {
          // authorityCertSerialNumber [2] INTEGER
          authorityCertSerialNumberHex = toHex(child.value);
          break;
        }
      }
    }
    off += child.endOffset;
  }

  return {
    kind: "authorityKeyIdentifier",
    extnID: "2.5.29.35",
    keyIdentifierHex,
    authorityCertIssuer,
    authorityCertSerialNumberHex,
  };
}

function interpretAuthorityInfoAccess(extnValueHex: string): ExtensionMeaning {
  const inner = innerDERFromOctetHex(extnValueHex);
  const root = BasicTLVParser.parse(inner);
  let body = root.value;
  if (
    root.tag.tagClass !== TagClass.Universal ||
    root.tag.tagNumber !== 16 ||
    !root.tag.constructed
  ) {
    body = inner;
  }

  const descriptions: AccessDescriptionMeaning[] = [];
  let off = 0;
  while (off < body.byteLength) {
    const adSeq = BasicTLVParser.parse(body.slice(off));
    let adBody = adSeq.value;
    if (
      adSeq.tag.tagClass !== TagClass.Universal ||
      adSeq.tag.tagNumber !== 16 ||
      !adSeq.tag.constructed
    ) {
      adBody = adSeq.value;
    }
    let adOff = 0;

    // accessMethod OID
    const idChild = BasicTLVParser.parse(adBody.slice(adOff));
    const accessMethod = decodeOID(idChild.value);
    adOff += idChild.endOffset;

    // accessLocation GeneralName
    let accessLocation: GeneralName;
    const locChild = BasicTLVParser.parse(adBody.slice(adOff));
    accessLocation = parseOneGeneralName(locChild);
    adOff += locChild.endOffset;

    descriptions.push({ accessMethod, accessLocation });
    off += adSeq.endOffset;
  }

  return {
    kind: "authorityInfoAccess",
    extnID: "1.3.6.1.5.5.7.1.1",
    descriptions,
  };
}

function interpretCRLDistributionPoints(extnValueHex: string): ExtensionMeaning {
  const inner = innerDERFromOctetHex(extnValueHex);
  const root = BasicTLVParser.parse(inner);
  let body = root.value;
  if (
    root.tag.tagClass !== TagClass.Universal ||
    root.tag.tagNumber !== 16 ||
    !root.tag.constructed
  ) {
    body = inner;
  }

  const distributionPoints: DistributionPointMeaning[] = [];
  let off = 0;
  while (off < body.byteLength) {
    const dpSeq = BasicTLVParser.parse(body.slice(off));
    const dpBody = dpSeq.value;
    const dp: DistributionPointMeaning = { hex: toHex(dpBody) };

    let dpOff = 0;
    while (dpOff < dpBody.byteLength) {
      const child = BasicTLVParser.parse(dpBody.slice(dpOff));
      const t = child.tag;

      if (t.tagClass === TagClass.ContextSpecific && t.tagNumber === 0) {
        // distributionPoint [0] DistributionPointName
        const dpNameChild = BasicTLVParser.parse(child.value);
        const nt = dpNameChild.tag;
        if (nt.tagClass === TagClass.ContextSpecific && nt.tagNumber === 0) {
          // fullName [0] GeneralNames
          const names = parseGeneralNamesFromBody(dpNameChild.value);
          if (names.length > 0) dp.fullName = names;
        }
        dpOff += child.endOffset;
      } else {
        dpOff += child.endOffset;
      }
    }

    distributionPoints.push(dp);
    off += dpSeq.endOffset;
  }

  return {
    kind: "cRLDistributionPoints",
    extnID: "2.5.29.31",
    distributionPoints,
  };
}

function interpretCTSignedCertificateTimestamps(
  extnValueHex: string,
): ExtensionMeaning {
  const inner = innerDERFromOctetHex(extnValueHex);
  const child = BasicTLVParser.parse(inner);
  let sctListHex: string;
  if (
    child.tag.tagClass === TagClass.Universal &&
    child.tag.tagNumber === 4 &&
    !child.tag.constructed
  ) {
    sctListHex = toHex(child.value);
  } else {
    sctListHex = toHex(inner);
  }
  return {
    kind: "ctSCTs",
    extnID: "1.3.6.1.4.1.11129.2.4.2",
    sctListHex,
  };
}

function interpretCertificatePolicies(extnValueHex: string): ExtensionMeaning {
  const inner = innerDERFromOctetHex(extnValueHex);
  const root = BasicTLVParser.parse(inner);
  let body = root.value;
  if (
    root.tag.tagClass !== TagClass.Universal ||
    root.tag.tagNumber !== 16 ||
    !root.tag.constructed
  ) {
    body = inner;
  }

  const policies: PolicyInformationMeaning[] = [];
  let off = 0;

  while (off < body.byteLength) {
    const slice = body.slice(off);
    const piSeq = BasicTLVParser.parse(slice);
    const piBody = piSeq.value;
    let piOff = 0;

    // policyIdentifier OID
    const oidChild = BasicTLVParser.parse(piBody.slice(piOff));
    const policyIdentifier = decodeOID(oidChild.value);
    piOff += oidChild.endOffset;

    const pi: PolicyInformationMeaning = { policyIdentifier };

    // optional policyQualifiers: SEQUENCE SIZE (1..MAX) OF PolicyQualifierInfo
    if (piOff < piBody.byteLength) {
      const pqChild = BasicTLVParser.parse(piBody.slice(piOff));
      let pqBody = pqChild.value;
      // pqChild should be a SEQUENCE, but if not, still consume as-is
      if (
        pqChild.tag.tagClass !== TagClass.Universal ||
        pqChild.tag.tagNumber !== 16 ||
        !pqChild.tag.constructed
      ) {
        pqBody = pqChild.value;
      }
      const pqs: PolicyQualifierInfoMeaning[] = [];
      let pqOff = 0;

      while (pqOff < pqBody.byteLength) {
        const onePQSeq = BasicTLVParser.parse(pqBody.slice(pqOff));
        const oneBody = onePQSeq.value;
        let oneOff = 0;

        // policyQualifierId OID
        const idChild = BasicTLVParser.parse(oneBody.slice(oneOff));
        const policyQualifierId = decodeOID(idChild.value);
        oneOff += idChild.endOffset;

        // qualifier: ANY defined by policyQualifierId (OPTIONAL)
        let qualifier: PolicyQualifier | undefined;
        if (oneOff < oneBody.byteLength) {
          const qualChild = BasicTLVParser.parse(oneBody.slice(oneOff));
          const t = qualChild.tag;

          // Recognize CPS URI (RFC 5280): id-qt-cps = 1.3.6.1.5.5.7.2.1 (IA5String URI)
          if (
            policyQualifierId === "1.3.6.1.5.5.7.2.1" &&
            t.tagClass === TagClass.Universal
          ) {
            // IA5String has tagNumber 22; we can decode as ASCII
            try {
              qualifier = { kind: "cpsUri", uri: decodeAscii(qualChild.value) };
            } catch {
              qualifier = {
                kind: "raw",
                tagNumber: t.tagNumber,
                constructed: t.constructed,
                tagClass: t.tagClass,
                hex: toHex(qualChild.value),
              };
            }
          }
          // Recognize UserNotice (RFC 5280): id-qt-unotice = 1.3.6.1.5.5.7.2.2 (SEQUENCE)
          else if (
            policyQualifierId === "1.3.6.1.5.5.7.2.2" &&
            t.tagClass === TagClass.Universal &&
            t.tagNumber === 16
          ) {
            // Keep raw hex for now; detailed parsing (NoticeRef, ExplicitText) can be added later
            qualifier = { kind: "userNotice", hex: toHex(qualChild.value) };
          } else {
            // Unknown qualifier: retain raw TLV details
            qualifier = {
              kind: "raw",
              tagNumber: t.tagNumber,
              constructed: t.constructed,
              tagClass: t.tagClass,
              hex: toHex(qualChild.value),
            };
          }

          oneOff += qualChild.endOffset;
        }

        pqs.push({ policyQualifierId, qualifier });
        pqOff += onePQSeq.endOffset;
      }

      if (pqs.length > 0) {
        pi.policyQualifiers = pqs;
      }
      piOff += pqChild.endOffset;
    }

    policies.push(pi);
    off += piSeq.endOffset;
  }

  return {
    kind: "certificatePolicies",
    extnID: "2.5.29.32",
    policies,
  };
}

/** IssuerAltName: SEQUENCE OF GeneralName */
function interpretIssuerAltName(extnValueHex: string): ExtensionMeaning {
  const inner = innerDERFromOctetHex(extnValueHex);
  const seq = BasicTLVParser.parse(inner);
  let body = seq.value;
  if (
    seq.tag.tagClass !== TagClass.Universal ||
    seq.tag.tagNumber !== 16 ||
    !seq.tag.constructed
  ) {
    body = inner;
  }
  const names = parseGeneralNamesFromBody(body);
  return { kind: "issuerAltName", extnID: "2.5.29.18", names };
}

/** SubjectInfoAccess: SEQUENCE OF AccessDescription (same structure as AIA) */
function interpretSubjectInfoAccess(extnValueHex: string): ExtensionMeaning {
  const inner = innerDERFromOctetHex(extnValueHex);
  const root = BasicTLVParser.parse(inner);
  let body = root.value;
  if (
    root.tag.tagClass !== TagClass.Universal ||
    root.tag.tagNumber !== 16 ||
    !root.tag.constructed
  ) {
    body = inner;
  }

  const descriptions: AccessDescriptionMeaning[] = [];
  let off = 0;
  while (off < body.byteLength) {
    const adSeq = BasicTLVParser.parse(body.slice(off));
    let adBody = adSeq.value;
    if (
      adSeq.tag.tagClass !== TagClass.Universal ||
      adSeq.tag.tagNumber !== 16 ||
      !adSeq.tag.constructed
    ) {
      adBody = adSeq.value;
    }
    let adOff = 0;

    const idChild = BasicTLVParser.parse(adBody.slice(adOff));
    const accessMethod = decodeOID(idChild.value);
    adOff += idChild.endOffset;

    const locChild = BasicTLVParser.parse(adBody.slice(adOff));
    const accessLocation = parseOneGeneralName(locChild);
    adOff += locChild.endOffset;

    descriptions.push({ accessMethod, accessLocation });
    off += adSeq.endOffset;
  }

  return {
    kind: "subjectInfoAccess",
    extnID: "1.3.6.1.5.5.7.1.11",
    descriptions,
  };
}

/** FreshestCRL: same syntax as CRLDistributionPoints */
function interpretFreshestCRL(extnValueHex: string): ExtensionMeaning {
  const inner = innerDERFromOctetHex(extnValueHex);
  const root = BasicTLVParser.parse(inner);
  let body = root.value;
  if (
    root.tag.tagClass !== TagClass.Universal ||
    root.tag.tagNumber !== 16 ||
    !root.tag.constructed
  ) {
    body = inner;
  }

  const distributionPoints: DistributionPointMeaning[] = [];
  let off = 0;
  while (off < body.byteLength) {
    const dpSeq = BasicTLVParser.parse(body.slice(off));
    const dpBody = dpSeq.value;
    const dp: DistributionPointMeaning = { hex: toHex(dpBody) };

    let dpOff = 0;
    while (dpOff < dpBody.byteLength) {
      const child = BasicTLVParser.parse(dpBody.slice(dpOff));
      const t = child.tag;

      if (t.tagClass === TagClass.ContextSpecific && t.tagNumber === 0) {
        const dpNameChild = BasicTLVParser.parse(child.value);
        const nt = dpNameChild.tag;
        if (nt.tagClass === TagClass.ContextSpecific && nt.tagNumber === 0) {
          const names = parseGeneralNamesFromBody(dpNameChild.value);
          if (names.length > 0) dp.fullName = names;
        }
        dpOff += child.endOffset;
      } else {
        dpOff += child.endOffset;
      }
    }

    distributionPoints.push(dp);
    off += dpSeq.endOffset;
  }

  return {
    kind: "freshestCRL",
    extnID: "2.5.29.46",
    distributionPoints,
  };
}

/** CertificateIssuer: GeneralNames */
function interpretCertificateIssuer(extnValueHex: string): ExtensionMeaning {
  const inner = innerDERFromOctetHex(extnValueHex);
  const seq = BasicTLVParser.parse(inner);
  let body = seq.value;
  if (
    seq.tag.tagClass !== TagClass.Universal ||
    seq.tag.tagNumber !== 16 ||
    !seq.tag.constructed
  ) {
    body = inner;
  }
  const names = parseGeneralNamesFromBody(body);
  return { kind: "certificateIssuer", extnID: "2.5.29.29", names };
}

/** PolicyMappings: SEQUENCE OF SEQUENCE { issuerDomainPolicy OID, subjectDomainPolicy OID } */
function interpretPolicyMappings(extnValueHex: string): ExtensionMeaning {
  const inner = innerDERFromOctetHex(extnValueHex);
  const root = BasicTLVParser.parse(inner);
  let body = root.value;
  if (
    root.tag.tagClass !== TagClass.Universal ||
    root.tag.tagNumber !== 16 ||
    !root.tag.constructed
  ) {
    body = inner;
  }

  const mappings: PolicyMappingPair[] = [];
  let off = 0;
  while (off < body.byteLength) {
    const pairSeq = BasicTLVParser.parse(body.slice(off));
    let pairBody = pairSeq.value;
    if (
      pairSeq.tag.tagClass !== TagClass.Universal ||
      pairSeq.tag.tagNumber !== 16 ||
      !pairSeq.tag.constructed
    ) {
      pairBody = pairSeq.value;
    }
    let pOff = 0;

    const issuerChild = BasicTLVParser.parse(pairBody.slice(pOff));
    const issuerDomainPolicy = decodeOID(issuerChild.value);
    pOff += issuerChild.endOffset;

    const subjectChild = BasicTLVParser.parse(pairBody.slice(pOff));
    const subjectDomainPolicy = decodeOID(subjectChild.value);
    pOff += subjectChild.endOffset;

    mappings.push({ issuerDomainPolicy, subjectDomainPolicy });
    off += pairSeq.endOffset;
  }

  return {
    kind: "policyMappings",
    extnID: "2.5.29.33",
    mappings,
  };
}

/** PolicyConstraints: SEQUENCE { requireExplicitPolicy [0] INTEGER OPTIONAL, inhibitPolicyMapping [1] INTEGER OPTIONAL } */
function interpretPolicyConstraints(extnValueHex: string): ExtensionMeaning {
  const inner = innerDERFromOctetHex(extnValueHex);
  const root = BasicTLVParser.parse(inner);
  let body = root.value;
  if (
    root.tag.tagClass !== TagClass.Universal ||
    root.tag.tagNumber !== 16 ||
    !root.tag.constructed
  ) {
    body = inner;
  }

  let requireExplicitPolicy: number | undefined;
  let inhibitPolicyMapping: number | undefined;

  let off = 0;
  while (off < body.byteLength) {
    const child = BasicTLVParser.parse(body.slice(off));
    const t = child.tag;
    if (t.tagClass === TagClass.ContextSpecific) {
      if (t.tagNumber === 0) {
        try {
          requireExplicitPolicy = decodeInteger(child.value);
        } catch {
          // leave undefined
        }
      } else if (t.tagNumber === 1) {
        try {
          inhibitPolicyMapping = decodeInteger(child.value);
        } catch {
          // leave undefined
        }
      }
    }
    off += child.endOffset;
  }

  return {
    kind: "policyConstraints",
    extnID: "2.5.29.36",
    requireExplicitPolicy,
    inhibitPolicyMapping,
  };
}

/** InhibitAnyPolicy: INTEGER SkipCerts */
function interpretInhibitAnyPolicy(extnValueHex: string): ExtensionMeaning {
  const inner = innerDERFromOctetHex(extnValueHex);
  const child = BasicTLVParser.parse(inner);
  let skipCerts = 0;
  if (
    child.tag.tagClass === TagClass.Universal &&
    child.tag.tagNumber === 2 &&
    !child.tag.constructed
  ) {
    try {
      skipCerts = decodeInteger(child.value);
    } catch {
      skipCerts = 0;
    }
  }
  return {
    kind: "inhibitAnyPolicy",
    extnID: "2.5.29.54",
    skipCerts,
  };
}

/** NameConstraints: SEQUENCE with permitted [0] GeneralSubtrees, excluded [1] GeneralSubtrees */
function interpretNameConstraints(extnValueHex: string): ExtensionMeaning {
  const inner = innerDERFromOctetHex(extnValueHex);
  const root = BasicTLVParser.parse(inner);
  let body = root.value;
  if (
    root.tag.tagClass !== TagClass.Universal ||
    root.tag.tagNumber !== 16 ||
    !root.tag.constructed
  ) {
    body = inner;
  }

  const parseGeneralSubtrees = (buf: ArrayBuffer): GeneralName[] => {
    const out: GeneralName[] = [];
    let off = 0;
    while (off < buf.byteLength) {
      const subtreeSeq = BasicTLVParser.parse(buf.slice(off));
      let subtreeBody = subtreeSeq.value;
      if (
        subtreeSeq.tag.tagClass !== TagClass.Universal ||
        subtreeSeq.tag.tagNumber !== 16 ||
        !subtreeSeq.tag.constructed
      ) {
        subtreeBody = subtreeSeq.value;
      }
      // base GeneralName is the first child of subtreeBody
      const baseChild = BasicTLVParser.parse(subtreeBody);
      out.push(parseOneGeneralName(baseChild));
      off += subtreeSeq.endOffset;
    }
    return out;
  };

  let permitted: GeneralName[] | undefined;
  let excluded: GeneralName[] | undefined;

  let off = 0;
  while (off < body.byteLength) {
    const child = BasicTLVParser.parse(body.slice(off));
    const t = child.tag;
    if (t.tagClass === TagClass.ContextSpecific) {
      if (t.tagNumber === 0) {
        const names = parseGeneralSubtrees(child.value);
        if (names.length > 0) permitted = names;
      } else if (t.tagNumber === 1) {
        const names = parseGeneralSubtrees(child.value);
        if (names.length > 0) excluded = names;
      }
    }
    off += child.endOffset;
  }

  return {
    kind: "nameConstraints",
    extnID: "2.5.29.30",
    permitted,
    excluded,
  };
}

type InterpretFn = (hex: string) => ExtensionMeaning;
const INTERPRET_REGISTRY: Record<string, InterpretFn> = {
  "2.5.29.15": interpretKeyUsage,
  "2.5.29.19": interpretBasicConstraints,
  "2.5.29.37": interpretExtendedKeyUsage,
  "2.5.29.17": interpretSubjectAltName,
  "2.5.29.18": interpretIssuerAltName,
  "2.5.29.32": interpretCertificatePolicies,
  "2.5.29.33": interpretPolicyMappings,
  "2.5.29.36": interpretPolicyConstraints,
  "2.5.29.54": interpretInhibitAnyPolicy,
  "2.5.29.30": interpretNameConstraints,
  "2.5.29.14": interpretSubjectKeyIdentifier,
  "2.5.29.35": interpretAuthorityKeyIdentifier,
  "2.5.29.31": interpretCRLDistributionPoints,
  "2.5.29.46": interpretFreshestCRL,
  "2.5.29.29": interpretCertificateIssuer,
  "1.3.6.1.5.5.7.1.1": interpretAuthorityInfoAccess,
  "1.3.6.1.5.5.7.1.11": interpretSubjectInfoAccess,
  "1.3.6.1.4.1.11129.2.4.2": interpretCTSignedCertificateTimestamps,
};

export function interpretExtnValue(
  extnID: string,
  extnValueHex: string,
): ExtensionMeaning {
  const fn = INTERPRET_REGISTRY[extnID];
  if (fn) return fn(extnValueHex);
  throw new Error(`Unknown extnID: ${extnID}`);
}

const parseSchema = createParseSchema();
const parser = new SchemaParser(parseSchema, { strict: true });
export function parseExtnValues(
  root: ReturnType<typeof parser.parse>,
): unknown {
  const itemsVal = root.tbsCertificate.extensions?.list.items;
  if (!Array.isArray(itemsVal)) return root;

  for (const item of itemsVal) {
    try {
      const iev = interpretExtnValue(item.extnID, item.extnValue.hex);
      (item as any).extnMeaning = iev;
    } catch {
      // ignore errors
    }
  }
  return root;
}

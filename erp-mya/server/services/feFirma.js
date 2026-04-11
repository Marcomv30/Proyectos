/**
 * feFirma.js — Firma digital XML XAdES-BES para FE Costa Rica
 */
import forge from 'node-forge';
import * as xadesjs from 'xadesjs';
import { Crypto } from '@peculiar/webcrypto';
import * as xmldom from '@xmldom/xmldom';
import xpath from 'xpath';

let engineReady = false;
const MH_POLICY_URL = 'https://cdn.comprobanteselectronicos.go.cr/xml-schemas/Resoluci%C3%B3n_General_sobre_disposiciones_t%C3%A9cnicas_comprobantes_electr%C3%B3nicos_para_efectos_tributarios.pdf';
const MH_POLICY_DIGEST_B64 = 'DWxin1xWOeI8OuWQXazh4VjLWAaCLAA954em7DMh0h8=';

function ensureEngine() {
  if (engineReady) return;
  xadesjs.Application.setEngine('NodeJS', new Crypto());
  xadesjs.setNodeDependencies({
    XMLSerializer: xmldom.XMLSerializer,
    DOMParser: xmldom.DOMParser,
    DOMImplementation: xmldom.DOMImplementation,
    xpath,
  });
  engineReady = true;
}

function pemBodyToArrayBuffer(pem) {
  const base64 = String(pem)
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  return Uint8Array.from(Buffer.from(base64, 'base64')).buffer;
}

function derBytesToBase64(bytes) {
  return Buffer.from(bytes, 'binary').toString('base64');
}

function extractP12Material(p12Buffer, p12Password) {
  const p12Der = forge.util.createBuffer(p12Buffer.toString('binary'));
  const p12Asn1 = forge.asn1.fromDer(p12Der);
  const p12Obj = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, p12Password);

  const keyBags = p12Obj.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const keyBag = (keyBags[forge.pki.oids.pkcs8ShroudedKeyBag] || [])[0];
  if (!keyBag?.key) throw new Error('No se encontró la llave privada en el .p12');

  const certBags = p12Obj.getBags({ bagType: forge.pki.oids.certBag });
  const certBag = (certBags[forge.pki.oids.certBag] || [])[0];
  if (!certBag?.cert) throw new Error('No se encontró el certificado en el .p12');

  const privateKeyInfo = forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(keyBag.key));
  const privateKeyPem = forge.pki.privateKeyInfoToPem(privateKeyInfo);
  const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(certBag.cert)).getBytes();
  const certB64 = derBytesToBase64(certDer);

  return { privateKeyPem, certB64 };
}

/**
 * Firma un XML con XAdES-BES.
 * @param {string} xmlStr
 * @param {Buffer} p12Buffer
 * @param {string} p12Password
 * @returns {Promise<string>}
 */
export async function firmarXml(xmlStr, p12Buffer, p12Password) {
  ensureEngine();

  const { privateKeyPem, certB64 } = extractP12Material(p12Buffer, p12Password);
  const privateKey = await xadesjs.Application.crypto.subtle.importKey(
    'pkcs8',
    pemBodyToArrayBuffer(privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const xmlDoc = xadesjs.Parse(xmlStr);
  const signedXml = new xadesjs.SignedXml();

  await signedXml.Sign(
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    privateKey,
    xmlDoc,
    {
      references: [{ uri: '', hash: 'SHA-256', transforms: ['enveloped', 'exc-c14n'] }],
      signingCertificate: certB64,
      x509: [certB64],
      signingTime: { value: new Date() },
      policy: {
        hash: 'SHA-256',
        digestValue: MH_POLICY_DIGEST_B64,
        identifier: {
          value: MH_POLICY_URL,
        },
      },
    }
  );

  return signedXml.toString();
}

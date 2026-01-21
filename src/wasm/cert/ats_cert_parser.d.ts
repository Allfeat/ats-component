/* tslint:disable */
/* eslint-disable */
export function parseAtsCertificate(json_str: string): AtsCertificate;
export function parseAtsCertificateToJs(json_str: string): any;
export function parseAtsCertificateFromFile(file_content: string): any;
export function generateAtsCertificateJson(cert: AtsCertificate): string;
export function generateAtsCertificateFromData(
  id_allfeat: string,
  version_number: string,
  title: string,
  asset_filename: string,
  creators_json: string
): string;
export function createAtsCertificateFromJsObject(js_obj: any): string;
export class AtsCertificate {
  free(): void;
  constructor(id_allfeat: string, version_number: string, title: string, asset_filename: string);
  addCreator(creator: Creator): void;
  getCreatorsCount(): number;
  toJson(): any;
  static fromJson(value: any): AtsCertificate;
  idAllfeat: string;
  versionNumber: string;
  title: string;
  assetFilename: string;
}
export class Creator {
  free(): void;
  constructor(fullname: string, email: string, roles: string[], ipi: string, isni: string);
  fullname: string;
  email: string;
  roles: string[];
  ipi: string;
  isni: string;
}

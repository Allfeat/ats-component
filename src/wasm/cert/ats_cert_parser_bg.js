let wasm;
export function __wbg_set_wasm(val) {
  wasm = val;
}

let cachedUint8ArrayMemory0 = null;

function getUint8ArrayMemory0() {
  if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
    cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
  }
  return cachedUint8ArrayMemory0;
}

const lTextDecoder =
  typeof TextDecoder === 'undefined' ? (0, module.require)('util').TextDecoder : TextDecoder;

let cachedTextDecoder = new lTextDecoder('utf-8', { ignoreBOM: true, fatal: true });

cachedTextDecoder.decode();

const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
  numBytesDecoded += len;
  if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
    cachedTextDecoder = new lTextDecoder('utf-8', { ignoreBOM: true, fatal: true });
    cachedTextDecoder.decode();
    numBytesDecoded = len;
  }
  return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

function getStringFromWasm0(ptr, len) {
  ptr = ptr >>> 0;
  return decodeText(ptr, len);
}

function logError(f, args) {
  try {
    return f.apply(this, args);
  } catch (e) {
    let error = (function () {
      try {
        return e instanceof Error ? `${e.message}\n\nStack:\n${e.stack}` : e.toString();
      } catch (_) {
        return '<failed to stringify thrown value>';
      }
    })();
    console.error(
      'wasm-bindgen: imported JS function that was not marked as `catch` threw an error:',
      error
    );
    throw e;
  }
}

let WASM_VECTOR_LEN = 0;

const lTextEncoder =
  typeof TextEncoder === 'undefined' ? (0, module.require)('util').TextEncoder : TextEncoder;

const cachedTextEncoder = new lTextEncoder('utf-8');

const encodeString =
  typeof cachedTextEncoder.encodeInto === 'function'
    ? function (arg, view) {
        return cachedTextEncoder.encodeInto(arg, view);
      }
    : function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
          read: arg.length,
          written: buf.length,
        };
      };

function passStringToWasm0(arg, malloc, realloc) {
  if (typeof arg !== 'string') throw new Error(`expected a string argument, found ${typeof arg}`);

  if (realloc === undefined) {
    const buf = cachedTextEncoder.encode(arg);
    const ptr = malloc(buf.length, 1) >>> 0;
    getUint8ArrayMemory0()
      .subarray(ptr, ptr + buf.length)
      .set(buf);
    WASM_VECTOR_LEN = buf.length;
    return ptr;
  }

  let len = arg.length;
  let ptr = malloc(len, 1) >>> 0;

  const mem = getUint8ArrayMemory0();

  let offset = 0;

  for (; offset < len; offset++) {
    const code = arg.charCodeAt(offset);
    if (code > 0x7f) break;
    mem[ptr + offset] = code;
  }

  if (offset !== len) {
    if (offset !== 0) {
      arg = arg.slice(offset);
    }
    ptr = realloc(ptr, len, (len = offset + arg.length * 3), 1) >>> 0;
    const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
    const ret = encodeString(arg, view);
    if (ret.read !== arg.length) throw new Error('failed to pass whole string');
    offset += ret.written;
    ptr = realloc(ptr, len, offset, 1) >>> 0;
  }

  WASM_VECTOR_LEN = offset;
  return ptr;
}

let cachedDataViewMemory0 = null;

function getDataViewMemory0() {
  if (
    cachedDataViewMemory0 === null ||
    cachedDataViewMemory0.buffer.detached === true ||
    (cachedDataViewMemory0.buffer.detached === undefined &&
      cachedDataViewMemory0.buffer !== wasm.memory.buffer)
  ) {
    cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
  }
  return cachedDataViewMemory0;
}

function addToExternrefTable0(obj) {
  const idx = wasm.__externref_table_alloc();
  wasm.__wbindgen_export_4.set(idx, obj);
  return idx;
}

function handleError(f, args) {
  try {
    return f.apply(this, args);
  } catch (e) {
    const idx = addToExternrefTable0(e);
    wasm.__wbindgen_exn_store(idx);
  }
}

function _assertBoolean(n) {
  if (typeof n !== 'boolean') {
    throw new Error(`expected a boolean argument, found ${typeof n}`);
  }
}

function _assertNum(n) {
  if (typeof n !== 'number') throw new Error(`expected a number argument, found ${typeof n}`);
}

function debugString(val) {
  // primitive types
  const type = typeof val;
  if (type == 'number' || type == 'boolean' || val == null) {
    return `${val}`;
  }
  if (type == 'string') {
    return `"${val}"`;
  }
  if (type == 'symbol') {
    const description = val.description;
    if (description == null) {
      return 'Symbol';
    } else {
      return `Symbol(${description})`;
    }
  }
  if (type == 'function') {
    const name = val.name;
    if (typeof name == 'string' && name.length > 0) {
      return `Function(${name})`;
    } else {
      return 'Function';
    }
  }
  // objects
  if (Array.isArray(val)) {
    const length = val.length;
    let debug = '[';
    if (length > 0) {
      debug += debugString(val[0]);
    }
    for (let i = 1; i < length; i++) {
      debug += ', ' + debugString(val[i]);
    }
    debug += ']';
    return debug;
  }
  // Test for built-in
  const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
  let className;
  if (builtInMatches && builtInMatches.length > 1) {
    className = builtInMatches[1];
  } else {
    // Failed to match the standard '[object ClassName]'
    return toString.call(val);
  }
  if (className == 'Object') {
    // we're a user defined class or Object
    // JSON.stringify avoids problems with cycles, and is generally much
    // easier than looping through ownProperties of `val`.
    try {
      return 'Object(' + JSON.stringify(val) + ')';
    } catch (_) {
      return 'Object';
    }
  }
  // errors
  if (val instanceof Error) {
    return `${val.name}: ${val.message}\n${val.stack}`;
  }
  // TODO we could test for more things here, like `Set`s and `Map`s.
  return className;
}

function isLikeNone(x) {
  return x === undefined || x === null;
}

function passArrayJsValueToWasm0(array, malloc) {
  const ptr = malloc(array.length * 4, 4) >>> 0;
  for (let i = 0; i < array.length; i++) {
    const add = addToExternrefTable0(array[i]);
    getDataViewMemory0().setUint32(ptr + 4 * i, add, true);
  }
  WASM_VECTOR_LEN = array.length;
  return ptr;
}

function getArrayJsValueFromWasm0(ptr, len) {
  ptr = ptr >>> 0;
  const mem = getDataViewMemory0();
  const result = [];
  for (let i = ptr; i < ptr + 4 * len; i += 4) {
    result.push(wasm.__wbindgen_export_4.get(mem.getUint32(i, true)));
  }
  wasm.__externref_drop_slice(ptr, len);
  return result;
}

function _assertClass(instance, klass) {
  if (!(instance instanceof klass)) {
    throw new Error(`expected instance of ${klass.name}`);
  }
}

function takeFromExternrefTable0(idx) {
  const value = wasm.__wbindgen_export_4.get(idx);
  wasm.__externref_table_dealloc(idx);
  return value;
}
/**
 * @param {string} json_str
 * @returns {AtsCertificate}
 */
export function parseAtsCertificate(json_str) {
  const ptr0 = passStringToWasm0(json_str, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
  const len0 = WASM_VECTOR_LEN;
  const ret = wasm.parseAtsCertificate(ptr0, len0);
  if (ret[2]) {
    throw takeFromExternrefTable0(ret[1]);
  }
  return AtsCertificate.__wrap(ret[0]);
}

/**
 * @param {string} json_str
 * @returns {any}
 */
export function parseAtsCertificateToJs(json_str) {
  const ptr0 = passStringToWasm0(json_str, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
  const len0 = WASM_VECTOR_LEN;
  const ret = wasm.parseAtsCertificateToJs(ptr0, len0);
  if (ret[2]) {
    throw takeFromExternrefTable0(ret[1]);
  }
  return takeFromExternrefTable0(ret[0]);
}

/**
 * @param {string} file_content
 * @returns {any}
 */
export function parseAtsCertificateFromFile(file_content) {
  const ptr0 = passStringToWasm0(file_content, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
  const len0 = WASM_VECTOR_LEN;
  const ret = wasm.parseAtsCertificateFromFile(ptr0, len0);
  if (ret[2]) {
    throw takeFromExternrefTable0(ret[1]);
  }
  return takeFromExternrefTable0(ret[0]);
}

/**
 * @param {AtsCertificate} cert
 * @returns {string}
 */
export function generateAtsCertificateJson(cert) {
  let deferred2_0;
  let deferred2_1;
  try {
    _assertClass(cert, AtsCertificate);
    if (cert.__wbg_ptr === 0) {
      throw new Error('Attempt to use a moved value');
    }
    const ret = wasm.generateAtsCertificateJson(cert.__wbg_ptr);
    var ptr1 = ret[0];
    var len1 = ret[1];
    if (ret[3]) {
      ptr1 = 0;
      len1 = 0;
      throw takeFromExternrefTable0(ret[2]);
    }
    deferred2_0 = ptr1;
    deferred2_1 = len1;
    return getStringFromWasm0(ptr1, len1);
  } finally {
    wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
  }
}

/**
 * @param {string} id_allfeat
 * @param {string} version_number
 * @param {string} title
 * @param {string} asset_filename
 * @param {string} creators_json
 * @returns {string}
 */
export function generateAtsCertificateFromData(
  id_allfeat,
  version_number,
  title,
  asset_filename,
  creators_json
) {
  let deferred7_0;
  let deferred7_1;
  try {
    const ptr0 = passStringToWasm0(id_allfeat, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(version_number, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(title, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ptr3 = passStringToWasm0(asset_filename, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len3 = WASM_VECTOR_LEN;
    const ptr4 = passStringToWasm0(creators_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len4 = WASM_VECTOR_LEN;
    const ret = wasm.generateAtsCertificateFromData(
      ptr0,
      len0,
      ptr1,
      len1,
      ptr2,
      len2,
      ptr3,
      len3,
      ptr4,
      len4
    );
    var ptr6 = ret[0];
    var len6 = ret[1];
    if (ret[3]) {
      ptr6 = 0;
      len6 = 0;
      throw takeFromExternrefTable0(ret[2]);
    }
    deferred7_0 = ptr6;
    deferred7_1 = len6;
    return getStringFromWasm0(ptr6, len6);
  } finally {
    wasm.__wbindgen_free(deferred7_0, deferred7_1, 1);
  }
}

/**
 * @param {any} js_obj
 * @returns {string}
 */
export function createAtsCertificateFromJsObject(js_obj) {
  let deferred2_0;
  let deferred2_1;
  try {
    const ret = wasm.createAtsCertificateFromJsObject(js_obj);
    var ptr1 = ret[0];
    var len1 = ret[1];
    if (ret[3]) {
      ptr1 = 0;
      len1 = 0;
      throw takeFromExternrefTable0(ret[2]);
    }
    deferred2_0 = ptr1;
    deferred2_1 = len1;
    return getStringFromWasm0(ptr1, len1);
  } finally {
    wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
  }
}

const AtsCertificateFinalization =
  typeof FinalizationRegistry === 'undefined'
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry((ptr) => wasm.__wbg_atscertificate_free(ptr >>> 0, 1));

export class AtsCertificate {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(AtsCertificate.prototype);
    obj.__wbg_ptr = ptr;
    AtsCertificateFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }

  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    AtsCertificateFinalization.unregister(this);
    return ptr;
  }

  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_atscertificate_free(ptr, 0);
  }
  /**
   * @param {string} id_allfeat
   * @param {string} version_number
   * @param {string} title
   * @param {string} asset_filename
   */
  constructor(id_allfeat, version_number, title, asset_filename) {
    const ptr0 = passStringToWasm0(id_allfeat, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(version_number, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(title, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ptr3 = passStringToWasm0(asset_filename, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len3 = WASM_VECTOR_LEN;
    const ret = wasm.atscertificate_new(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3);
    this.__wbg_ptr = ret >>> 0;
    AtsCertificateFinalization.register(this, this.__wbg_ptr, this);
    return this;
  }
  /**
   * @returns {string}
   */
  get idAllfeat() {
    let deferred1_0;
    let deferred1_1;
    try {
      if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
      _assertNum(this.__wbg_ptr);
      const ret = wasm.atscertificate_idAllfeat(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  /**
   * @param {string} id
   */
  set idAllfeat(id) {
    if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
    _assertNum(this.__wbg_ptr);
    const ptr0 = passStringToWasm0(id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.atscertificate_set_idAllfeat(this.__wbg_ptr, ptr0, len0);
  }
  /**
   * @returns {string}
   */
  get versionNumber() {
    let deferred1_0;
    let deferred1_1;
    try {
      if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
      _assertNum(this.__wbg_ptr);
      const ret = wasm.atscertificate_versionNumber(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  /**
   * @param {string} version
   */
  set versionNumber(version) {
    if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
    _assertNum(this.__wbg_ptr);
    const ptr0 = passStringToWasm0(version, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.atscertificate_set_versionNumber(this.__wbg_ptr, ptr0, len0);
  }
  /**
   * @returns {string}
   */
  get title() {
    let deferred1_0;
    let deferred1_1;
    try {
      if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
      _assertNum(this.__wbg_ptr);
      const ret = wasm.atscertificate_title(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  /**
   * @param {string} title
   */
  set title(title) {
    if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
    _assertNum(this.__wbg_ptr);
    const ptr0 = passStringToWasm0(title, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.atscertificate_set_title(this.__wbg_ptr, ptr0, len0);
  }
  /**
   * @returns {string}
   */
  get assetFilename() {
    let deferred1_0;
    let deferred1_1;
    try {
      if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
      _assertNum(this.__wbg_ptr);
      const ret = wasm.atscertificate_assetFilename(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  /**
   * @param {string} filename
   */
  set assetFilename(filename) {
    if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
    _assertNum(this.__wbg_ptr);
    const ptr0 = passStringToWasm0(filename, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.atscertificate_set_assetFilename(this.__wbg_ptr, ptr0, len0);
  }
  /**
   * @param {Creator} creator
   */
  addCreator(creator) {
    if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
    _assertNum(this.__wbg_ptr);
    _assertClass(creator, Creator);
    if (creator.__wbg_ptr === 0) {
      throw new Error('Attempt to use a moved value');
    }
    var ptr0 = creator.__destroy_into_raw();
    wasm.atscertificate_addCreator(this.__wbg_ptr, ptr0);
  }
  /**
   * @returns {number}
   */
  getCreatorsCount() {
    if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
    _assertNum(this.__wbg_ptr);
    const ret = wasm.atscertificate_getCreatorsCount(this.__wbg_ptr);
    return ret >>> 0;
  }
  /**
   * @returns {any}
   */
  toJson() {
    if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
    _assertNum(this.__wbg_ptr);
    const ret = wasm.atscertificate_toJson(this.__wbg_ptr);
    if (ret[2]) {
      throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
  }
  /**
   * @param {any} value
   * @returns {AtsCertificate}
   */
  static fromJson(value) {
    const ret = wasm.atscertificate_fromJson(value);
    if (ret[2]) {
      throw takeFromExternrefTable0(ret[1]);
    }
    return AtsCertificate.__wrap(ret[0]);
  }
}

const CreatorFinalization =
  typeof FinalizationRegistry === 'undefined'
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry((ptr) => wasm.__wbg_creator_free(ptr >>> 0, 1));

export class Creator {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    CreatorFinalization.unregister(this);
    return ptr;
  }

  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_creator_free(ptr, 0);
  }
  /**
   * @param {string} fullname
   * @param {string} email
   * @param {string[]} roles
   * @param {string} ipi
   * @param {string} isni
   */
  constructor(fullname, email, roles, ipi, isni) {
    const ptr0 = passStringToWasm0(fullname, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(email, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passArrayJsValueToWasm0(roles, wasm.__wbindgen_malloc);
    const len2 = WASM_VECTOR_LEN;
    const ptr3 = passStringToWasm0(ipi, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len3 = WASM_VECTOR_LEN;
    const ptr4 = passStringToWasm0(isni, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len4 = WASM_VECTOR_LEN;
    const ret = wasm.creator_new(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4);
    this.__wbg_ptr = ret >>> 0;
    CreatorFinalization.register(this, this.__wbg_ptr, this);
    return this;
  }
  /**
   * @returns {string}
   */
  get fullname() {
    let deferred1_0;
    let deferred1_1;
    try {
      if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
      _assertNum(this.__wbg_ptr);
      const ret = wasm.creator_fullname(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  /**
   * @param {string} fullname
   */
  set fullname(fullname) {
    if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
    _assertNum(this.__wbg_ptr);
    const ptr0 = passStringToWasm0(fullname, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.creator_set_fullname(this.__wbg_ptr, ptr0, len0);
  }
  /**
   * @returns {string}
   */
  get email() {
    let deferred1_0;
    let deferred1_1;
    try {
      if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
      _assertNum(this.__wbg_ptr);
      const ret = wasm.creator_email(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  /**
   * @param {string} email
   */
  set email(email) {
    if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
    _assertNum(this.__wbg_ptr);
    const ptr0 = passStringToWasm0(email, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.creator_set_email(this.__wbg_ptr, ptr0, len0);
  }
  /**
   * @returns {string[]}
   */
  get roles() {
    if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
    _assertNum(this.__wbg_ptr);
    const ret = wasm.creator_roles(this.__wbg_ptr);
    var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v1;
  }
  /**
   * @param {string[]} roles
   */
  set roles(roles) {
    if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
    _assertNum(this.__wbg_ptr);
    const ptr0 = passArrayJsValueToWasm0(roles, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.creator_set_roles(this.__wbg_ptr, ptr0, len0);
  }
  /**
   * @returns {string}
   */
  get ipi() {
    let deferred1_0;
    let deferred1_1;
    try {
      if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
      _assertNum(this.__wbg_ptr);
      const ret = wasm.creator_ipi(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  /**
   * @param {string} ipi
   */
  set ipi(ipi) {
    if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
    _assertNum(this.__wbg_ptr);
    const ptr0 = passStringToWasm0(ipi, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.creator_set_ipi(this.__wbg_ptr, ptr0, len0);
  }
  /**
   * @returns {string}
   */
  get isni() {
    let deferred1_0;
    let deferred1_1;
    try {
      if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
      _assertNum(this.__wbg_ptr);
      const ret = wasm.creator_isni(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  /**
   * @param {string} isni
   */
  set isni(isni) {
    if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
    _assertNum(this.__wbg_ptr);
    const ptr0 = passStringToWasm0(isni, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.creator_set_isni(this.__wbg_ptr, ptr0, len0);
  }
}

export function __wbg_Error_0497d5bdba9362e5() {
  return logError(function (arg0, arg1) {
    const ret = Error(getStringFromWasm0(arg0, arg1));
    return ret;
  }, arguments);
}

export function __wbg_String_8f0eb39a4a4c2f66() {
  return logError(function (arg0, arg1) {
    const ret = String(arg1);
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
  }, arguments);
}

export function __wbg_buffer_a1a27a0dfa70165d() {
  return logError(function (arg0) {
    const ret = arg0.buffer;
    return ret;
  }, arguments);
}

export function __wbg_call_fbe8be8bf6436ce5() {
  return handleError(function (arg0, arg1) {
    const ret = arg0.call(arg1);
    return ret;
  }, arguments);
}

export function __wbg_done_4d01f352bade43b7() {
  return logError(function (arg0) {
    const ret = arg0.done;
    _assertBoolean(ret);
    return ret;
  }, arguments);
}

export function __wbg_get_92470be87867c2e5() {
  return handleError(function (arg0, arg1) {
    const ret = Reflect.get(arg0, arg1);
    return ret;
  }, arguments);
}

export function __wbg_get_a131a44bd1eb6979() {
  return logError(function (arg0, arg1) {
    const ret = arg0[arg1 >>> 0];
    return ret;
  }, arguments);
}

export function __wbg_getwithrefkey_1dc361bd10053bfe() {
  return logError(function (arg0, arg1) {
    const ret = arg0[arg1];
    return ret;
  }, arguments);
}

export function __wbg_instanceof_ArrayBuffer_a8b6f580b363f2bc() {
  return logError(function (arg0) {
    let result;
    try {
      result = arg0 instanceof ArrayBuffer;
    } catch (_) {
      result = false;
    }
    const ret = result;
    _assertBoolean(ret);
    return ret;
  }, arguments);
}

export function __wbg_instanceof_Uint8Array_ca460677bc155827() {
  return logError(function (arg0) {
    let result;
    try {
      result = arg0 instanceof Uint8Array;
    } catch (_) {
      result = false;
    }
    const ret = result;
    _assertBoolean(ret);
    return ret;
  }, arguments);
}

export function __wbg_isArray_5f090bed72bd4f89() {
  return logError(function (arg0) {
    const ret = Array.isArray(arg0);
    _assertBoolean(ret);
    return ret;
  }, arguments);
}

export function __wbg_iterator_4068add5b2aef7a6() {
  return logError(function () {
    const ret = Symbol.iterator;
    return ret;
  }, arguments);
}

export function __wbg_length_ab6d22b5ead75c72() {
  return logError(function (arg0) {
    const ret = arg0.length;
    _assertNum(ret);
    return ret;
  }, arguments);
}

export function __wbg_length_f00ec12454a5d9fd() {
  return logError(function (arg0) {
    const ret = arg0.length;
    _assertNum(ret);
    return ret;
  }, arguments);
}

export function __wbg_new_07b483f72211fd66() {
  return logError(function () {
    const ret = new Object();
    return ret;
  }, arguments);
}

export function __wbg_new_58353953ad2097cc() {
  return logError(function () {
    const ret = new Array();
    return ret;
  }, arguments);
}

export function __wbg_new_e52b3efaaa774f96() {
  return logError(function (arg0) {
    const ret = new Uint8Array(arg0);
    return ret;
  }, arguments);
}

export function __wbg_next_8bb824d217961b5d() {
  return logError(function (arg0) {
    const ret = arg0.next;
    return ret;
  }, arguments);
}

export function __wbg_next_e2da48d8fff7439a() {
  return handleError(function (arg0) {
    const ret = arg0.next();
    return ret;
  }, arguments);
}

export function __wbg_set_3f1d0b984ed272ed() {
  return logError(function (arg0, arg1, arg2) {
    arg0[arg1] = arg2;
  }, arguments);
}

export function __wbg_set_7422acbe992d64ab() {
  return logError(function (arg0, arg1, arg2) {
    arg0[arg1 >>> 0] = arg2;
  }, arguments);
}

export function __wbg_set_fe4e79d1ed3b0e9b() {
  return logError(function (arg0, arg1, arg2) {
    arg0.set(arg1, arg2 >>> 0);
  }, arguments);
}

export function __wbg_value_17b896954e14f896() {
  return logError(function (arg0) {
    const ret = arg0.value;
    return ret;
  }, arguments);
}

export function __wbindgen_boolean_get(arg0) {
  const v = arg0;
  const ret = typeof v === 'boolean' ? (v ? 1 : 0) : 2;
  _assertNum(ret);
  return ret;
}

export function __wbindgen_debug_string(arg0, arg1) {
  const ret = debugString(arg1);
  const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
  const len1 = WASM_VECTOR_LEN;
  getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
  getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
}

export function __wbindgen_in(arg0, arg1) {
  const ret = arg0 in arg1;
  _assertBoolean(ret);
  return ret;
}

export function __wbindgen_init_externref_table() {
  const table = wasm.__wbindgen_export_4;
  const offset = table.grow(4);
  table.set(0, undefined);
  table.set(offset + 0, undefined);
  table.set(offset + 1, null);
  table.set(offset + 2, true);
  table.set(offset + 3, false);
}

export function __wbindgen_is_function(arg0) {
  const ret = typeof arg0 === 'function';
  _assertBoolean(ret);
  return ret;
}

export function __wbindgen_is_object(arg0) {
  const val = arg0;
  const ret = typeof val === 'object' && val !== null;
  _assertBoolean(ret);
  return ret;
}

export function __wbindgen_is_undefined(arg0) {
  const ret = arg0 === undefined;
  _assertBoolean(ret);
  return ret;
}

export function __wbindgen_jsval_loose_eq(arg0, arg1) {
  const ret = arg0 == arg1;
  _assertBoolean(ret);
  return ret;
}

export function __wbindgen_memory() {
  const ret = wasm.memory;
  return ret;
}

export function __wbindgen_number_get(arg0, arg1) {
  const obj = arg1;
  const ret = typeof obj === 'number' ? obj : undefined;
  if (!isLikeNone(ret)) {
    _assertNum(ret);
  }
  getDataViewMemory0().setFloat64(arg0 + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
  getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
}

export function __wbindgen_string_get(arg0, arg1) {
  const obj = arg1;
  const ret = typeof obj === 'string' ? obj : undefined;
  var ptr1 = isLikeNone(ret)
    ? 0
    : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
  var len1 = WASM_VECTOR_LEN;
  getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
  getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
}

export function __wbindgen_string_new(arg0, arg1) {
  const ret = getStringFromWasm0(arg0, arg1);
  return ret;
}

export function __wbindgen_throw(arg0, arg1) {
  throw new Error(getStringFromWasm0(arg0, arg1));
}

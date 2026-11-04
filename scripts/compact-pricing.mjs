/** Pack only the browser bundle; the reviewed JSON and its schema stay unchanged. */
export function compactPricingModule(snapshot) {
  const { tlds, ...metadata } = snapshot;
  const serialize = (v) => JSON.stringify(v).replace(/</g, '\\u003c');
  const parseJson = (v) => `JSON.parse(${serialize(JSON.stringify(v))})`;
  // Unexpected future schema: retain every field instead of discarding data.
  if (!tlds || typeof tlds !== 'object' || Array.isArray(tlds) ||
      Object.values(tlds).some((quotes) => !quotes || typeof quotes !== 'object' || Array.isArray(quotes) ||
        Object.values(quotes).some((price) => !Array.isArray(price) || price.length !== 3 || price.some((value) => value !== null && !['number', 'string', 'boolean'].includes(typeof value))))) {
    return `export default ${parseJson(snapshot)};`;
  }
  const ids = [...new Set(Object.values(tlds).flatMap((quotes) => Object.keys(quotes)))];
  const safeMetadata = JSON.stringify(metadata).includes('\"__proto__\":') ? parseJson(metadata) : serialize(metadata);
  const rows = Object.entries(tlds).map(([zone, quotes]) => [zone, ...Object.entries(quotes).flatMap(([id, price]) => [ids.indexOf(id), ...price])]);
  return `const ids=${serialize(ids)},rows=${serialize(rows)},data=${safeMetadata};data.tlds=Object.fromEntries(rows.map(([zone,...prices])=>{const out={};for(let i=0;i<prices.length;i+=4)Object.defineProperty(out,ids[prices[i]],{value:prices.slice(i+1,i+4),enumerable:true,writable:true,configurable:true});return [zone,out]}));export default data;`;
}

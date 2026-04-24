import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const root = process.cwd();
const specDir = path.join(root, 'packages', 'nostr-pos-protocol-spec');
const schemasDir = path.join(specDir, 'schemas');
const vectorsDir = path.join(specDir, 'test-vectors');

const vectorSchemas = new Map([
  ['pos-profile.json', 'pos-profile.schema.json'],
  ['terminal-authorization.json', 'terminal-authorization.schema.json'],
  ['sale-created.json', 'sale-created.schema.json'],
  ['payment-status.json', 'payment-status.schema.json'],
  ['receipt.json', 'receipt.schema.json'],
  ['swap-recovery.json', 'swap-recovery.schema.json']
]);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

for (const file of fs.readdirSync(schemasDir).filter((name) => name.endsWith('.json')).sort()) {
  ajv.addSchema(readJson(path.join(schemasDir, file)), file);
}

const failures = [];
for (const [vectorFile, schemaFile] of vectorSchemas) {
  const vectorPath = path.join(vectorsDir, vectorFile);
  if (!fs.existsSync(vectorPath)) {
    failures.push(`${vectorFile}: missing test vector`);
    continue;
  }
  const validate = ajv.getSchema(schemaFile);
  if (!validate) {
    failures.push(`${schemaFile}: schema was not registered`);
    continue;
  }
  const ok = validate(readJson(vectorPath));
  if (!ok) {
    failures.push(`${vectorFile}: ${ajv.errorsText(validate.errors, { separator: '; ' })}`);
  }
}

if (failures.length > 0) {
  console.error(`Protocol spec validation failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log(`Protocol spec validation passed for ${vectorSchemas.size} vectors.`);

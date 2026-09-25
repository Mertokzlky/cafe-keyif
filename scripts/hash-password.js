#!/usr/bin/env node
// Kullanım: npm run hash-password -- "seciminiz-olan-sifre"
// Çıktıyı Render'da (ya da .env dosyanızda) ADMIN_PASS_HASH olarak kullanın.
const bcrypt = require('bcryptjs');

const password = process.argv[2];
if (!password) {
    console.error('Kullanım: npm run hash-password -- "sifreniz"');
    process.exit(1);
}

console.log(bcrypt.hashSync(password, 10));

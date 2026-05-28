const fs = require('fs');
const path = require('path');

const vaultDir = path.resolve(__dirname, '../../..');
const peopleDir = path.join(vaultDir, 'People');
// 使用前面脚本备份的具体目录
const backupDir = path.join(vaultDir, 'Backup_People_1779961032747');

console.log('开始从备份恢复数据...');
console.log('备份目录:', backupDir);
console.log('目标目录:', peopleDir);

if (!fs.existsSync(backupDir)) {
    console.error('备份目录不存在，无法恢复！');
    process.exit(1);
}

const files = fs.readdirSync(backupDir);
let restoredCount = 0;

files.forEach(file => {
    if (file.endsWith('.md')) {
        const src = path.join(backupDir, file);
        const dest = path.join(peopleDir, file);
        fs.copyFileSync(src, dest);
        restoredCount++;
    }
});

console.log(`[成功] 已成功从备份还原 ${restoredCount} 个文件！`);

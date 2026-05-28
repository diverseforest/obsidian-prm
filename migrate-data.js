const fs = require('fs');
const path = require('path');

// 备份目录路径
const vaultDir = path.resolve(__dirname, '../../..');
const peopleDir = path.join(vaultDir, 'People');
const backupDir = path.join(vaultDir, 'Backup_People_' + Date.now());

console.log('开始执行人脉数据清洗迁移脚本 (V2 稳健版)...');
console.log('库根目录:', vaultDir);
console.log('人物目录:', peopleDir);

if (!fs.existsSync(peopleDir)) {
    console.error('错误: People 目录不存在！请确认路径。');
    process.exit(1);
}

// 1. 创建安全备份
try {
    fs.mkdirSync(backupDir, { recursive: true });
    const files = fs.readdirSync(peopleDir);
    let backedUpCount = 0;
    
    files.forEach(file => {
        if (file.endsWith('.md')) {
            const src = path.join(peopleDir, file);
            const dest = path.join(backupDir, file);
            fs.copyFileSync(src, dest);
            backedUpCount++;
        }
    });
    console.log(`[成功] 已在以下路径创建 ${backedUpCount} 个文件的备份: \n  ${backupDir}`);
} catch (e) {
    console.error('备份失败，为了数据安全，中止运行。', e);
    process.exit(1);
}

// 2. 清洗提取逻辑
let updatedCount = 0;
const files = fs.readdirSync(peopleDir);

files.forEach(file => {
    if (!file.endsWith('.md')) return;
    
    const filePath = path.join(peopleDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // 按行切分，兼容 \r\n, \n, \r 所有换行格式
    const lines = content.split(/\r?\n|\r/);
    let rawLoc = '';
    
    for (let line of lines) {
        const match = line.match(/^-\s*城市\/常出没[：:]\s*(.*)/);
        if (match) {
            rawLoc = match[1].trim();
            break;
        }
    }
    
    if (rawLoc && rawLoc !== '') {
        // 分割解析城市，支持 、 , ， / 空格 等
        const rawCities = rawLoc.split(/[、，,\/\s+]/).map(c => c.trim()).filter(c => c !== '');
        
        if (rawCities.length > 0) {
            console.log(`[解析成功] 笔记 [${file}] 正文提取到城市:`, rawCities);
            
            // 将提取的城市列表写入 frontmatter
            const fmRegex = /^---\r?\n([\s\S]*?)\r?\n---/;
            const fmMatch = content.match(fmRegex);
            
            if (fmMatch) {
                let fmContent = fmMatch[1];
                
                // 检查是否已有 city 字段
                const cityPropRegex = /^city:\s*(.*)$/m;
                const hasCity = cityPropRegex.test(fmContent);
                
                // 构建 YAML 格式：单个为 string，多个为列表
                const yamlArray = rawCities.length === 1 
                    ? `city: ${rawCities[0]}` 
                    : `city:\n` + rawCities.map(c => `  - "${c}"`).join('\n');
                    
                if (hasCity) {
                    // 覆盖已有的 city 字段
                    fmContent = fmContent.replace(/^city:\s*[\s\S]*?(?=\r?\n\w+:|$)/m, yamlArray);
                } else {
                    // 如果没有 city 字段，追加到末尾
                    fmContent = fmContent.trim() + '\n' + yamlArray + '\n';
                }
                
                // 替换回原内容
                const newFm = `---\n${fmContent.trim()}\n---`;
                const newContent = content.replace(fmRegex, newFm);
                
                fs.writeFileSync(filePath, newContent, 'utf8');
                updatedCount++;
                console.log(`[已更新] 笔记 [${file}] 写入 YAML 属性:`, rawCities);
            } else {
                console.log(`[警告] 笔记 [${file}] 未包含 YAML Frontmatter，跳过属性写入。`);
            }
        }
    } else {
        console.log(`[忽略] 笔记 [${file}] 未在正文填写“城市/常出没”，无需迁移。`);
    }
});

console.log(`\n🎉 数据清洗迁移完成！`);
console.log(`总计更新文件数: ${updatedCount} 个`);
console.log(`原始备份文件保存在: ${backupDir}`);

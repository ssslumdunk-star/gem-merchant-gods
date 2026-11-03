#!/usr/bin/env python3
"""抽取中文文案（精确版）。

对每个字符串字面量：
  1. 剥离 HTML 标签 <...>
  2. 把 ${...} 插值替换为占位符，并记录是否为变量句
  3. 剥离 JS 代码残留
  4. 只保留「以中文为主」的片段

输出 i18n_strings.json: [{zh, has_var, files:[...], occurrences:n}]
"""
import json
import re
import sys
from collections import OrderedDict

ROOT = __file__.rsplit('/tools/', 1)[0]
CN = re.compile(r'[\u4e00-\u9fa5]')
TAG = re.compile(r'<[^>]*>')

# 字符串字面量（宽松，允许转义）
STR_RE = re.compile(
    r'"((?:[^"\\]|\\.)*)"'
    r"|'((?:[^'\\]|\\.)*)'"
    r"|`((?:[^`\\]|\\.)*)`",
    re.S
)
COMMENT_LINE = re.compile(r'^\s*(//|/\*|\*)')


def clean(raw):
    """从字符串字面量里剥离 HTML 与插值，返回 (文本, 是否变量句)。"""
    s = raw
    # 记录是否有插值（在剥离前判断）
    has_var = '${' in s
    # 插值 → 占位符
    s = re.sub(r'\$\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', '\x00', s)
    # 剥离 HTML 标签
    s = TAG.sub(' ', s)
    # 去掉 JS 残留：连续符号、属性片段
    s = re.sub(r'["\']\s*[:+]\s*["\']', ' ', s)
    # 空白归一
    s = re.sub(r'\s+', ' ', s).strip()
    # 去掉首尾孤立标点
    s = s.strip(' :;,·|')
    return s, has_var


def is_ui_text(s):
    """判断是否像一句人话（而非代码片段）。"""
    if not s or not CN.search(s):
        return False
    if len(s) > 200:
        return False
    # 中文占比要够高：中文字数 / 总字符数
    cn_count = len(CN.findall(s))
    if cn_count < 1:
        return False
    # 排除含明显代码符号的
    if re.search(r'[{}<>]|=>|function|return |const |var |\.map\(|\.join\(|\|\||&&', s):
        return False
    # 排除以 . / ( / ) 等结尾的碎片
    if re.match(r'^[.)\]},;:]', s):
        return False
    return True


def extract_file(path, relname):
    src = open(path, encoding='utf-8').read()
    results = []
    for m in STR_RE.finditer(src):
        raw = m.group(1) or m.group(2) or m.group(3)
        if raw is None:
            continue
        s, has_var = clean(raw)
        if is_ui_text(s):
            results.append({'zh': s, 'has_var': has_var, 'file': relname})
    return results


def main():
    files = [
        ('index.html', 'index.html'),
        ('logic.js', 'logic.js'),
        ('server.js', 'server.js'),
    ]
    agg = OrderedDict()
    for fname, rel in files:
        for item in extract_file(f'{ROOT}/{fname}', rel):
            key = item['zh']
            if key not in agg:
                agg[key] = {'zh': key, 'has_var': False, 'files': set(), 'n': 0}
            agg[key]['files'].add(rel)
            agg[key]['n'] += 1
            if item['has_var']:
                agg[key]['has_var'] = True

    out = []
    for v in agg.values():
        out.append({
            'zh': v['zh'],
            'has_var': v['has_var'],
            'files': sorted(v['files']),
            'n': v['n'],
        })
    out.sort(key=lambda x: (-len(x['zh']), x['zh']))

    with open(f'{ROOT}/i18n_strings.json', 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    # 统计
    print(f'总条数: {len(out)}')
    static = [x for x in out if not x['has_var']]
    var = [x for x in out if x['has_var']]
    print(f'  静态整句: {len(static)}')
    print(f'  含变量:   {len(var)}')
    idx = [x for x in out if 'index.html' in x['files']]
    print(f'  涉及 index.html: {len(idx)}')
    lg = [x for x in out if 'logic.js' in x['files']]
    print(f'  涉及 logic.js:   {len(lg)}')
    print('\n已写入 i18n_strings.json')


if __name__ == '__main__':
    main()

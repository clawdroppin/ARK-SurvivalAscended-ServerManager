import re, json, sys
src = open(sys.argv[1], encoding='utf-8').read()
lines = src.split('\n')
# track section headings by char offset
heads = [(m.start(), m.group(1).strip()) for m in re.finditer(r'^=+\s*(.+?)\s*=+\s*$', src, re.M)]
def section_at(pos):
    s = None
    for p,h in heads:
        if p < pos: s = h
        else: break
    return s
out=[]
for m in re.finditer(r'\{\{Server config variable(.*?)\n\}\}', src, re.S):
    body=m.group(1)
    d={'section':section_at(m.start())}
    for f in ['name','type','default','cli','inASA','inASE','version']:
        mm=re.search(r'^\|\s*'+f+r'\s*=\s*(.*)$', body, re.M)
        d[f]=mm.group(1).strip() if mm else ''
    out.append(d)
json.dump(out, open(sys.argv[2],'w',encoding='utf-8'), indent=0)
from collections import Counter
print(len(out)); print(Counter(o['section'] for o in out)); print(Counter(o['inASA'] for o in out))

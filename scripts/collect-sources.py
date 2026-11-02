"""Download official primary sources; save text for expert verification, not automatic indexing."""
from pathlib import Path
from bs4 import BeautifulSoup
from urllib.request import Request,urlopen
import json,hashlib,re
sources=[
 {'title':'상속세 및 증여세법 제26조 · 상속세 세율','kind':'law','url':'https://www.law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1029615621','notes':'연결된 법률 버전의 시행일을 확인했습니다. 증여세 세율 준용·부칙·신고세액공제 등은 별도 조문 검토가 필요합니다.','selector':'body','start':'상속세 및 증여세법','end':'파일형식 선택'},
 {'title':'상속세 및 증여세법 · 일괄공제와 연결 조문','kind':'law','url':'https://www.law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1027435327','notes':'일괄공제와 배우자공제 등 연결 조문입니다. 공제 한도와 적용 시점은 별도 확인해야 합니다.','selector':'body','start':'상속세 및 증여세법','end':'파일형식 선택'},
 {'title':'소득세법 제97조의2 · 양도소득의 필요경비 계산 특례','kind':'law','url':'https://www.law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1034035043','effective_from':'2026-07-01','notes':'법률 제21221호. 과거 증여·양도는 당시 법령과 개정 부칙을 별도 확인해야 합니다.','selector':'body','start':'소득세법','end':'파일형식 선택'},
 {'title':'대법원 2020두53378 · 명의신탁·명의개서해태 증여의제','kind':'case','url':'https://www.law.go.kr/LSW/precInfoP.do?precSeq=237563','case_number':'2020두53378','decision_date':'2023-09-21','notes':'2003년 개정 전 구 상증세법을 해석한 판결입니다. 현재 거래에 대한 직접 적용을 보장하지 않습니다.','selector':'body','start':'증여세부과처분취소','end':'화면내검색 입력 폼'},
 {'title':'대법원 2015두40941 · 개별 증여재산가액산정 규정의 과세 한계','kind':'case','url':'https://law.go.kr/LSW/precInfoP.do?precSeq=204243','case_number':'2015두40941','decision_date':'2018-12-13','notes':'2007년 개정 전 구 상증세법의 상장 이익 과세 범위를 다룬 판결입니다. 현행법·사실관계 차이를 검토해야 합니다.','selector':'body','start':'증여세부과처분취소','end':'화면내검색 입력 폼'},
]
out=[]
for source in sources:
 req=Request(source['url'],headers={'User-Agent':'SEUM-Source-Collection/1.0'})
 with urlopen(req,timeout=40) as r: raw=r.read(); encoding=r.headers.get_content_charset() or 'utf-8'
 soup=BeautifulSoup(raw.decode(encoding,errors='replace'),'html.parser')
 for img in soup.find_all('img'):
  if len(img.get('alt',''))>80:img.replace_with(img['alt'])
 for el in soup(['script','style','nav','header','footer','form','noscript']):el.decompose()
 text=soup.get_text('\n',strip=True)
 start=text.find(source['start']);end=text.find(source['end'],start)
 if start<0:raise RuntimeError('Primary text not present: '+source['url'])
 text=text[start:end if end>start else None]
 text=re.sub(r'\n{3,}','\n\n',text)
 if len(text)<300 or '\ufffd' in text:raise RuntimeError('Incomplete source: '+source['url'])
 if source['kind']=='case' and source['case_number'] not in text:raise RuntimeError('Case number mismatch')
 item={k:v for k,v in source.items() if k not in {'selector','start','end'}}
 if source['kind']=='law':
  match=re.search(r'\[시행\s+(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.',text)
  if not match:raise RuntimeError('Missing enacted date: '+source['url'])
  item['effective_from']='%04d-%02d-%02d'%tuple(map(int,match.groups()))
 item.update(body=text,digest=hashlib.sha256(text.encode()).hexdigest(),collected_at='2026-11-02',status='prepared')
 out.append(item)
 print(source['title']+': '+str(len(text))+' characters')
Path('data').mkdir(exist_ok=True)
Path('data/corpus.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')

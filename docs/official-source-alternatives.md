# 공식 세법 자료 제공 경로 검토

확인일: 2026-11-07. 아래 내용은 공개 공식 문서 검토이며 API 가입·인증정보 생성·실제 대체 API 호출은 수행하지 않았습니다. 현재 배포의 제공자를 바꾸지 않습니다.

## 국세청 해석례
- 국가법령정보센터 `target=ntsCgmExpc`는 제목·문서번호·해석일자·자료 기준시점·상세 링크를 제공합니다. 본문 검색 옵션이 있어도 반환 데이터는 목록 메타데이터입니다.
- 공식 API 목록에는 국세청 해석례 본문 API가 없습니다. 검색 결과를 답변 근거로 쓰려면 별도로 본문을 확보·검증해야 합니다. 전체 수록 범위와 동기화 지연은 확인되지 않았습니다.
- https://open.law.go.kr/LSO/openApi/guideResult.do?htmlName=cgmExpcNtsListGuide
- https://open.law.go.kr/LSO/openApi/guideList.do

## 조세심판원 재결례와 법원 판례
- `target=ttSpecialDecc` 상세는 JSON/XML/HTML로 주문·이유·재결요지·관련법령 등을 제공합니다. 국세청 질의회신이나 모든 행정 불복 자료와 같은 분류가 아닙니다.
- `target=prec` 일반 판례 상세는 본문을 제공하지만, 국세청 제공 판례는 공식 설명상 HTML만 지원합니다. 이 HTML이 국세청 연결과 독립적으로 동작하는지는 검증하지 않았습니다. 수록 기관이나 확정 상태를 추정하지 않습니다.
- https://open.law.go.kr/LSO/openApi/guideResult.do?htmlName=specialDeccTtListGuide
- https://open.law.go.kr/LSO/openApi/guideResult.do?htmlName=specialDeccTtInfoGuide
- https://open.law.go.kr/LSO/openApi/guideResult.do?htmlName=precListGuide
- https://open.law.go.kr/LSO/openApi/guideResult.do?htmlName=precInfoGuide

## 법령과 연혁
- `target=eflaw`는 연혁(nw=1), 시행예정(nw=2), 현행(nw=3)을 구분합니다. 기본 전체 범위를 현재 적용 법령으로 간주하지 않습니다.
- 상세에서 ID를 쓰면 현행법을 반환하고 efYd를 무시하므로 과거 버전은 문서의 MST와 시행일 계약에 따라 요청해야 합니다. 부칙·경과규정·적용례 검토는 별개입니다.
- https://open.law.go.kr/LSO/openApi/guideResult.do?htmlName=lsEfYdListGuide
- https://open.law.go.kr/LSO/openApi/guideResult.do?htmlName=lsEfYdInfoGuide

## 이용 요건과 구현 전제
- 등록된 OC와 해당 서비스 이용 권한이 필요합니다. 신청에는 회원가입·본인 확인·시스템 도메인·목적 등이 포함됩니다. 서버 IP 입력란은 있지만 필수 IP 허용목록을 뜻하는지는 확인되지 않았습니다.
- 승인 기간은 신청 화면과 안내 문서 설명이 달라 확정하지 않습니다. 출처 표시와 호출량 제한을 준수해야 합니다.
- https://open.law.go.kr/LSO/usrJoin.do
- https://open.law.go.kr/LSO/information/guide.do
- 정식 이용이 허용된 뒤에도 제공자·원기관·자료종류·시점·본문 검증 상태를 별도로 유지해야 합니다. 메타데이터는 metadata_only로 두고 검증된 본문을 대신하지 않습니다.

## 현재 연결 문제의 해석
- 약18.5초 실패는 앱의18초 전체/12초 시도 제한과 부합합니다. Cloudflare의 일률적인 요청 시간 제한이라는 증거는 아닙니다. HTTP Worker는 클라이언트 연결이 유지되는 동안 고정된 wall-clock 제한이 없다는 공식 설명이 있습니다.
- https://developers.cloudflare.com/workers/platform/limits/#duration
- https://developers.cloudflare.com/workers/platform/known-issues/
- Mac 운영 검증에서는 동일 검색의 첫 실패 후 재시도와 상세 조회가 성공했습니다. 간헐적 경로 문제의 정확한 원인은 여전히 확인되지 않았습니다. 우회 프록시·네트워크 설정·인증 변경이나 시간 제한 확대를 적용하지 않았습니다.

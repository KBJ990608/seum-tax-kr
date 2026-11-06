import {ApiError,officialUrl,validDate} from './core.mjs';
import {calculateTax} from './tax.mjs';
export const MARCO_CONTRACT=Object.freeze({upstream_commit:'c7d648a7fd952e750b8b3b0cb017d6b79ba27b13',pack_id:'marco-korean-tax-core-2026-11-06',knowledge_sha256:'ff6ace5449d5c9fa587f2dad3ca923b094d2dc2ae76b1563521333e1cbb4b99c',supported_from:'2026-01-02',verified_through:'2026-11-06'});
function endpoint(env){
 if(!env.MARCO_SERVICE_URL)return null;
 let url;try{url=new URL(env.MARCO_SERVICE_URL);}catch{throw new ApiError(503,'MARCO_CONFIGURATION_INVALID','MARCO 서버 주소를 확인해야 합니다.');}
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash||!['','/'].includes(url.pathname)||url.hostname==='localhost'||/^[\d.]+$/.test(url.hostname)||url.hostname.includes(':')||url.hostname.endsWith('.local'))throw new ApiError(503,'MARCO_CONFIGURATION_INVALID','MARCO 서버의 검증된 HTTPS 원본 주소가 필요합니다.');
 return url.origin;
}
async function read(env,origin,path,input){
 let response;try{response=await(env.__marcoFetch||fetch)(origin+path,{method:input?'POST':'GET',headers:input?{'Content-Type':'application/json'}:{Accept:'application/json'},body:input?JSON.stringify(input):undefined,signal:AbortSignal.timeout(10000),redirect:'error'});}catch{throw new ApiError(503,'MARCO_UNAVAILABLE','MARCO 서버에 연결하지 못했습니다. 검증 결과를 생성하지 않았습니다.');}
 if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw new ApiError(502,'MARCO_RESPONSE_INVALID','MARCO 응답을 확인하지 못했습니다.');
 const reader=response.body?.getReader();if(!reader)throw new ApiError(502,'MARCO_RESPONSE_INVALID','MARCO 응답이 비어 있습니다.');
 let total=0,parts=[];for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>65536){await reader.cancel();throw new ApiError(502,'MARCO_RESPONSE_INVALID','MARCO 응답 크기 제한을 초과했습니다.');}parts.push(value);}
 const bytes=new Uint8Array(total);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new ApiError(502,'MARCO_RESPONSE_INVALID','MARCO 응답 형식을 확인하지 못했습니다.');}
}
function verified(health){return health?.status==='ok'&&health.service==='marco-korean-tax'&&health.api_version===1&&health.execution_mode==='source_bound_rules_and_native_knowledge_graph'&&health.llm_used===false&&health.request_persistence===false&&Object.entries(MARCO_CONTRACT).every(([key,value])=>health[key]===value)&&health.general_freeform_counseling===false;}
export async function marcoStatus(env){
 let origin;try{origin=endpoint(env);}catch(e){return {configured:true,engine_verified:false,reason:e.message};}
 if(!origin)return {configured:false,engine_verified:false,reason:'별도 MARCO 서버가 아직 연결되지 않았습니다. 아래 수동 세액 계산은 이용할 수 있습니다.',supported_from:MARCO_CONTRACT.supported_from,verified_through:MARCO_CONTRACT.verified_through};
 try{const health=await read(env,origin,'/health');if(!verified(health))return {configured:true,engine_verified:false,reason:'등록한 MARCO 코드·지식 버전 또는 실행 범위와 서버가 일치하지 않습니다. 결과를 사용하지 않습니다.'};return {configured:true,engine_verified:true,engine_commit:health.upstream_commit,knowledge_version:health.pack_id,knowledge_sha256:health.knowledge_sha256,supported_from:health.supported_from,verified_through:health.verified_through,service_origin:origin,execution_mode:health.execution_mode};}catch(e){return {configured:true,engine_verified:false,reason:e.message};}
}
export async function marcoEvaluate(env,input){
 const keys=['tax_type','as_of','amount_kind','tax_base_won','basic_rate_only','consent'];
 if(!input||Array.isArray(input)||typeof input!=='object'||Object.keys(input).some(key=>!keys.includes(key)))throw new ApiError(400,'MARCO_INPUT_INVALID','MARCO 검증에는 지정된 금액·세목 필드만 사용할 수 있습니다.');
 if(input.consent!==true)throw new ApiError(400,'MARCO_CONSENT_REQUIRED','별도 MARCO 서버로 세목·적용일·과세표준을 보내는 데 동의해 주세요.');
 if(!['gift','inheritance'].includes(input.tax_type)||input.amount_kind!=='tax_base'||input.basic_rate_only!==true||!Number.isSafeInteger(input.tax_base_won)||input.tax_base_won<0||input.tax_base_won>1000000000000000)throw new ApiError(400,'MARCO_INPUT_INVALID','지원하는 세목과 확인된 과세표준을 정수 원 단위로 입력해 주세요.');
 const date=validDate(input.as_of);if(!date)throw new ApiError(400,'MARCO_INPUT_INVALID','적용 기준일이 필요합니다.');
 if(date<MARCO_CONTRACT.supported_from||date>MARCO_CONTRACT.verified_through)throw new ApiError(422,'MARCO_DATE_UNSUPPORTED','확인된 MARCO 지식 범위는 2026-01-02부터 2026-11-06까지입니다.');
 const integration=await marcoStatus(env);if(!integration.engine_verified)throw new ApiError(503,'MARCO_NOT_VERIFIED',integration.reason);
 const payload={tax_type:input.tax_type,as_of:date,amount_kind:'tax_base',tax_base_won:input.tax_base_won,basic_rate_only:true};
 const result=await read(env,endpoint(env),'/evaluate',payload);
 if(!result||result.schema_version!==1||result.pack_id!==MARCO_CONTRACT.pack_id||result.knowledge_sha256!==MARCO_CONTRACT.knowledge_sha256||!['computed','unsupported','insufficient_information','invalid_input'].includes(result.status)||typeof result.reason!=='string'||!Array.isArray(result.sources)||!Array.isArray(result.source_ids)||!Array.isArray(result.rule_trace)||!Array.isArray(result.assumptions)||!Array.isArray(result.limitations))throw new ApiError(502,'MARCO_RESULT_UNVERIFIED','MARCO 결과의 버전·응답 계약을 검증하지 못했습니다.');
 if(result.assumptions.concat(result.limitations).some(value=>typeof value!=='string'))throw new ApiError(502,'MARCO_RESULT_UNVERIFIED','MARCO 적용 범위 응답을 검증하지 못했습니다.');
 const ids=new Set();for(const source of result.sources){if(typeof source?.id!=='string'||typeof source.title!=='string'||typeof source.effective_from!=='string'||typeof source.verified_on!=='string'||ids.has(source.id))throw new ApiError(502,'MARCO_RESULT_UNVERIFIED','MARCO 출처를 검증하지 못했습니다.');officialUrl(source.url);ids.add(source.id);}
 if(result.source_ids.some(id=>!ids.has(id)))throw new ApiError(502,'MARCO_RESULT_UNVERIFIED','MARCO 인용 출처가 응답 자료와 일치하지 않습니다.');
 if(result.status==='computed'){
  const check=calculateTax({tax_kind:input.tax_type==='gift'?'증여세':'상속세',transaction_date:date,confirmed:true,inputs:{amount:input.tax_base_won,debt:0,prior:0,deduction:0}});
  if(result.tax_type!==input.tax_type||result.as_of!==date||result.tax_base_won!==input.tax_base_won||!Number.isSafeInteger(result.basic_tax_won)||result.basic_tax_won!==check.calculated_tax||result.below_minimum!==(input.tax_base_won<500000)||!result.source_ids.length||!result.rule_trace.length)throw new ApiError(502,'MARCO_RESULT_UNVERIFIED','MARCO 응답과 확인한 입력·산술 결과가 일치하지 않아 결과를 보류했습니다.');
 }else if(result.basic_tax_won!==null)throw new ApiError(502,'MARCO_RESULT_UNVERIFIED','MARCO가 보류한 요청에 세액이 포함되어 결과를 사용하지 않습니다.');
 return {result,integration};
}

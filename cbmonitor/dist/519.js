"use strict";(self.webpackChunkcbmonitor=self.webpackChunkcbmonitor||[]).push([[519],{519:(e,t,a)=>{a.r(t),a.d(t,{default:()=>x});var r=a(959),o=a.n(r),n=a(89),c=a(7),s=a(611),l=a(531);const i={kv:["kv_99p_throughput","kv_95p_latency","kv_set_latency","kv_get_latency","kv_ops_per_second"],hidd:["hidd_read_throughput","hidd_write_throughput","hidd_io_latency"],rebalance:["rebalance_duration","rebalance_data_transfer_rate","rebalance_vbucket_moves"],xdcr:["xdcr_replication_lag","xdcr_throughput","xdcr_conflict_rate"],query:["query_response_time","query_throughput","query_cache_hit_rate"],search:["search_index_size","search_query_latency","search_indexing_rate"],analytics:["analytics_query_time","analytics_data_ingestion_rate","analytics_memory_usage"],eventing:["eventing_function_execution_time","eventing_doc_processing_rate","eventing_error_rate"],tools:["backup_duration","restore_duration","compaction_rate"],"sync-gateway":["sync_gateway_connections","sync_gateway_sync_latency","sync_gateway_conflict_rate"],mobile:["mobile_sync_time","mobile_offline_data_size","mobile_push_latency"],sdks:["sdk_connection_time","sdk_operation_latency","sdk_error_rate"],fio:["fio_read_iops","fio_write_iops","fio_bandwidth"]};function d(e,t,a,r,o,n,c){try{var s=e[n](c),l=s.value}catch(e){return void a(e)}s.done?t(l):Promise.resolve(l).then(r,o)}function m(e){return function(){var t=this,a=arguments;return new Promise(function(r,o){var n=e.apply(t,a);function c(e){d(n,r,o,c,s,"next",e)}function s(e){d(n,r,o,c,s,"throw",e)}c(void 0)})}}const p="/api/plugins/cbmonitor/resources";const u=new class{getComponentMetrics(e,t,a){return m(function*(){try{const r=new URLSearchParams;t&&r.append("category",t),a&&r.append("subCategory",a);const o=r.toString(),n=`${p}/metrics/${e}${o?`?${o}`:""}`,c=yield fetch(n,{method:"GET",headers:{"Content-Type":"application/json"}});if(!c.ok)throw new Error(`Failed to fetch metrics for ${e}: ${c.statusText}`);const s=yield c.json();if(!s.success)throw new Error(s.error||"Unknown API error");return s.data}catch(t){return console.error(`Error fetching metrics for ${e}:`,t),this.getMockComponentMetrics(e)}}).call(this)}getMultipleComponentMetrics(e){return m(function*(){try{const t=e.map(e=>this.getComponentMetrics(e));return yield Promise.all(t)}catch(e){throw console.error("Error fetching multiple component metrics:",e),e}}).call(this)}getMetricHistory(e,t,a=50){return m(function*(){try{const r=yield fetch(`${p}/metrics/${e}/${t}?limit=${a}`,{method:"GET",headers:{"Content-Type":"application/json"}});if(!r.ok)throw new Error(`Failed to fetch metric history: ${r.statusText}`);return yield r.json()}catch(a){console.error(`Error fetching metric history for ${e}/${t}:`,a);const r=this.getMockComponentMetrics(e).metrics.find(e=>e.id===t);if(r)return r;throw a}}).call(this)}getMockComponentMetrics(e){const t=["7.2.0","7.2.1","7.2.2","7.3.0","7.3.1"],a=(i[e]||[]).map((e,a)=>{const r=t.map(e=>({version:e,value:1e3*Math.random()+100*a,timestamp:new Date(Date.now()-30*Math.random()*24*60*60*1e3).toISOString(),buildNumber:`${e}-${Math.floor(9999*Math.random())}`}));return{id:e,name:this.formatMetricName(e),description:`${this.formatMetricName(e)} performance metric`,unit:this.getMetricUnit(e),category:this.getMetricCategory(e),values:r.sort((e,t)=>e.version.localeCompare(t.version))}});return{componentId:e,componentName:this.formatComponentName(e),metrics:a,lastUpdated:(new Date).toISOString()}}formatMetricName(e){return e.replace(/_/g," ").replace(/\b\w/g,e=>e.toUpperCase())}formatComponentName(e){return{kv:"Key-Value",hidd:"HiDD",rebalance:"Rebalance",xdcr:"XDCR",query:"Query",search:"Search",analytics:"Analytics",eventing:"Eventing",tools:"Tools","sync-gateway":"Sync Gateway",mobile:"Mobile",sdks:"SDKs",fio:"FIO"}[e]||e}getMetricUnit(e){return e.includes("latency")||e.includes("time")||e.includes("duration")?"ms":e.includes("throughput")||e.includes("ops")||e.includes("rate")?"ops/sec":e.includes("size")||e.includes("memory")?"MB":e.includes("percentage")||e.includes("hit_rate")?"%":e.includes("iops")?"IOPS":e.includes("bandwidth")?"MB/s":"value"}getMetricCategory(e){return e.includes("latency")||e.includes("time")||e.includes("duration")?"latency":e.includes("throughput")||e.includes("ops")||e.includes("rate")?"throughput":e.includes("memory")||e.includes("size")?"memory":e.includes("error")||e.includes("conflict")?"errors":"general"}};function g(e,t,a,r,o,n,c){try{var s=e[n](c),l=s.value}catch(e){return void a(e)}s.done?t(l):Promise.resolve(l).then(r,o)}function b(e){return function(){var t=this,a=arguments;return new Promise(function(r,o){var n=e.apply(t,a);function c(e){g(n,r,o,c,s,"next",e)}function s(e){g(n,r,o,c,s,"throw",e)}c(void 0)})}}const h=({metrics:e,loading:t,error:a,onRefetch:n})=>{var s;const l=(0,c.useStyles2)(y),[i,d]=(0,r.useState)("");if(t)return o().createElement("div",{className:l.loadingContainer},o().createElement(c.Spinner,{size:"lg"}),o().createElement("p",null,"Loading metrics..."));if(a)return o().createElement(c.Alert,{title:"Error Loading Metrics",severity:"error"},o().createElement("p",null,a),o().createElement(c.Button,{onClick:n,variant:"secondary",size:"sm"},"Retry"));if(!e||!e.metrics.length)return o().createElement("div",{className:l.emptyState},o().createElement("p",null,"No metrics available for this component."),o().createElement(c.Button,{onClick:n,variant:"secondary"},"Refresh"));const m=e.metrics.map(e=>({label:e.name,value:e.id,description:e.description})),p=e.metrics.find(e=>e.id===i)||e.metrics[0],u=p.values[p.values.length-1],g=p.values[p.values.length-2],b=u&&g?(u.value-g.value)/g.value*100:0;return o().createElement("div",{className:l.container},o().createElement("div",{className:l.header},o().createElement("div",{className:l.metricSelector},o().createElement("label",{htmlFor:"metric-select"},"Select Metric:"),o().createElement(c.Select,{inputId:"metric-select",options:m,value:i||(null===(s=m[0])||void 0===s?void 0:s.value),onChange:e=>d((null==e?void 0:e.value)||""),placeholder:"Choose a metric...",width:"auto"})),o().createElement("div",{className:l.metricStats},o().createElement("div",{className:l.statItem},o().createElement("span",{className:l.statLabel},"Latest Value:"),o().createElement("span",{className:l.statValue},null==u?void 0:u.value.toFixed(2)," ",p.unit)),0!==b&&o().createElement("div",{className:l.statItem},o().createElement("span",{className:l.statLabel},"Trend:"),o().createElement(c.Badge,{text:`${b>0?"+":""}${b.toFixed(1)}%`,color:b>0?"green":"red"})),o().createElement("div",{className:l.statItem},o().createElement("span",{className:l.statLabel},"Category:"),o().createElement(c.Badge,{text:p.category,color:"blue"})))),o().createElement("div",{className:l.description},o().createElement("h4",null,p.name),o().createElement("p",null,p.description)),o().createElement("div",{className:l.tableContainer},o().createElement("div",{className:l.tableHeader},o().createElement("h5",null,"Performance Data Across Versions"),o().createElement(c.Button,{onClick:n,variant:"secondary",size:"sm",icon:"sync"},"Refresh")),o().createElement("div",{className:l.customTable},o().createElement("div",{className:l.tableHeaderRow},o().createElement("div",{className:l.tableHeaderCell},"Version"),o().createElement("div",{className:l.tableHeaderCell},"Value"),o().createElement("div",{className:l.tableHeaderCell},"Build"),o().createElement("div",{className:l.tableHeaderCell},"Date")),p.values.map((e,t)=>o().createElement("div",{key:t,className:l.tableRow},o().createElement("div",{className:l.tableCell},o().createElement(c.Badge,{text:e.version,color:"blue"})),o().createElement("div",{className:l.tableCell},o().createElement("div",{className:l.valueCell},o().createElement("span",{className:l.value},e.value.toFixed(2)),o().createElement("span",{className:l.unit},p.unit))),o().createElement("div",{className:l.tableCell},e.buildNumber||"N/A"),o().createElement("div",{className:l.tableCell},new Date(e.timestamp||"").toLocaleDateString()))))),o().createElement("div",{className:l.footer},o().createElement("small",null,"Last updated: ",new Date(e.lastUpdated).toLocaleString()," • ","Component: ",e.componentName," • ","Total metrics: ",e.metrics.length)))},y=e=>({container:n.css`
    padding: 16px;
    background-color: ${e.colors.background.primary};
  `,loadingContainer:n.css`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 200px;
    gap: 16px;
    color: ${e.colors.text.secondary};
  `,emptyState:n.css`
    text-align: center;
    padding: 48px;
    color: ${e.colors.text.secondary};

    p {
      margin-bottom: 16px;
    }
  `,header:n.css`
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 24px;
    flex-wrap: wrap;
    gap: 16px;
  `,metricSelector:n.css`
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 300px;

    label {
      font-weight: 500;
      color: ${e.colors.text.primary};
    }
  `,metricStats:n.css`
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
  `,statItem:n.css`
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-items: center;
  `,statLabel:n.css`
    font-size: 12px;
    color: ${e.colors.text.secondary};
    text-transform: uppercase;
    font-weight: 500;
  `,statValue:n.css`
    font-size: 16px;
    font-weight: 500;
    color: ${e.colors.text.primary};
  `,description:n.css`
    margin-bottom: 24px;
    padding: 16px;
    background-color: ${e.colors.background.secondary};
    border-radius: 4px;
    border-left: 4px solid ${e.colors.primary.main};

    h4 {
      margin: 0 0 8px 0;
      color: ${e.colors.text.primary};
    }

    p {
      margin: 0;
      color: ${e.colors.text.secondary};
      font-size: 14px;
    }
  `,tableContainer:n.css`
    background-color: ${e.colors.background.secondary};
    border: 1px solid ${e.colors.border.weak};
    border-radius: 4px;
    overflow: hidden;
  `,tableHeader:n.css`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    border-bottom: 1px solid ${e.colors.border.weak};

    h5 {
      margin: 0;
      color: ${e.colors.text.primary};
    }
  `,customTable:n.css`
    width: 100%;
  `,tableHeaderRow:n.css`
    display: grid;
    grid-template-columns: 1fr 1fr 1fr 1fr;
    gap: 16px;
    padding: 12px 16px;
    background-color: ${e.colors.background.canvas};
    border-bottom: 2px solid ${e.colors.border.medium};
    font-weight: 600;
    color: ${e.colors.text.primary};
    font-size: 14px;
  `,tableHeaderCell:n.css`
    text-align: left;
  `,tableRow:n.css`
    display: grid;
    grid-template-columns: 1fr 1fr 1fr 1fr;
    gap: 16px;
    padding: 12px 16px;
    border-bottom: 1px solid ${e.colors.border.weak};

    &:hover {
      background-color: ${e.colors.background.secondary};
    }

    &:last-child {
      border-bottom: none;
    }
  `,tableCell:n.css`
    display: flex;
    align-items: center;
    color: ${e.colors.text.secondary};
    font-size: 14px;
  `,valueCell:n.css`
    display: flex;
    align-items: baseline;
    gap: 4px;
  `,value:n.css`
    font-weight: 500;
    color: ${e.colors.text.primary};
  `,unit:n.css`
    font-size: 12px;
    color: ${e.colors.text.secondary};
  `,footer:n.css`
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid ${e.colors.border.weak};
    text-align: center;
    color: ${e.colors.text.secondary};
  `}),f=[{id:"kv",label:"KV",icon:"database"},{id:"hidd",label:"HiDD",icon:"database"},{id:"rebalance",label:"Rebalance",icon:"repeat"},{id:"xdcr",label:"XDCR",icon:"sync"},{id:"query",label:"Query",icon:"table"},{id:"search",label:"Search",icon:"search"},{id:"analytics",label:"Analytics",icon:"chart-line"},{id:"eventing",label:"Eventing",icon:"bolt"},{id:"tools",label:"Tools",icon:"cog"},{id:"sync-gateway",label:"Sync Gateway",icon:"sync-slash"},{id:"mobile",label:"Mobile",icon:"mobile-android"},{id:"sdks",label:"SDKs",icon:"apps"},{id:"fio",label:"FIO",icon:"play"}];const x=function(){const e=(0,c.useStyles2)(v),[t,a]=(0,r.useState)("kv"),{metrics:n,loading:i,error:d,refetch:m}=(e=>{const[t,a]=(0,r.useState)(null),[o,n]=(0,r.useState)(!1),[c,s]=(0,r.useState)(null),l=(0,r.useCallback)(()=>b(function*(){if(e){n(!0),s(null);try{const t=yield u.getComponentMetrics(e);a(t)}catch(e){s(e instanceof Error?e.message:"Failed to load metrics"),console.error("Error fetching metrics:",e)}finally{n(!1)}}})(),[e]);return(0,r.useEffect)(()=>{l()},[l]),{metrics:t,loading:o,error:c,refetch:l}})(t);return o().createElement(l.PluginPage,null,o().createElement("div",{"data-testid":s.b.showfast.container,className:e.dashboard},o().createElement("div",{className:e.tabsContainer},o().createElement(c.TabsBar,{className:e.tabsBar},f.map(e=>o().createElement(c.Tab,{key:e.id,label:e.label,active:t===e.id,onChangeTab:()=>{a(e.id)},icon:e.icon}))),o().createElement(c.TabContent,{className:e.tabContentWrapper},o().createElement("div",{className:e.tabContent},o().createElement(h,{metrics:n,loading:i,error:d,onRefetch:m}))))))},v=e=>({dashboard:n.css`
    padding: 24px;
    background-color: ${e.colors.background.primary};
    min-height: 100vh;
  `,header:n.css`
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 1px solid ${e.colors.border.weak};
  `,title:n.css`
    margin: 0 0 8px 0;
    color: ${e.colors.text.primary};
    font-size: 32px;
    font-weight: 500;
  `,description:n.css`
    margin: 0;
    color: ${e.colors.text.secondary};
    font-size: 16px;
    line-height: 1.4;
  `,tabsContainer:n.css`
    background-color: ${e.colors.background.primary};
  `,tabsBar:n.css`
    margin-bottom: 16px;
    border-bottom: 1px solid ${e.colors.border.weak};
  `,tabContentWrapper:n.css`
    min-height: 500px;
  `,tabContent:n.css`
    padding: 16px 0;
  `,contentHeader:n.css`
    margin-bottom: 24px;

    h2 {
      margin: 0 0 8px 0;
      color: ${e.colors.text.primary};
      font-size: 24px;
      font-weight: 500;
    }

    p {
      margin: 0;
      color: ${e.colors.text.secondary};
      font-size: 14px;
    }
  `})},611:(e,t,a)=>{a.d(t,{b:()=>r});const r={appConfig:{apiKey:"data-testid ac-api-key",apiUrl:"data-testid ac-api-url",submit:"data-testid ac-submit-form"},showfast:{container:"data-testid showfast-container"}}}}]);
//# sourceMappingURL=519.js.map?_cache=04a5b30e431c953ae417
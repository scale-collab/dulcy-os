import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {CalendarStore} from './calendar-store.mjs';
import {CalendarFlow} from './calendar-flow.mjs';
import {calendarHandler} from './calendar-http.mjs';

const config=JSON.parse(readFileSync(process.env.CALENDAR_CONFIG||'/data/private/config.json','utf8'));
const store=new CalendarStore(process.env.CALENDAR_DB||'/data/calendar.sqlite',Buffer.from(config.encryptionKey,'base64'));
const flow=new CalendarFlow({store,apps:config.apps||{},origin:process.env.CALENDAR_ORIGIN||'https://n8n.dulcy.io'});
const handle=calendarHandler({flow,adminToken:config.adminToken,readerToken:config.readerToken,inviterToken:config.inviterToken});
const server=createServer(handle);server.requestTimeout=30000;server.headersTimeout=10000;server.maxHeadersCount=50;
server.listen(Number(process.env.PORT||8789),'0.0.0.0',()=>process.stdout.write('Calendar connection service ready\n'));
process.on('SIGTERM',()=>server.close(()=>{store.close();process.exit(0)}));

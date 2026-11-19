// Disposable SMTP sink and authoritative TXT responder. Neither forwards traffic.
const net = require('node:net');
const dgram = require('node:dgram');
exports.start = async t => {
  const state={connections:0,accepted:0,verified:false};
  const smtp=net.createServer(s=>{
    state.connections++; let input='',recipient='',data=false;
    s.setEncoding('utf8'); s.on('error',()=>{}); s.write('220 sink ESMTP\r\n');
    s.on('data',chunk=>{input+=chunk; let i;
      while((i=input.indexOf('\r\n'))>=0){const line=input.slice(0,i);input=input.slice(i+2);
        if(data){if(line!=='.')continue;data=false;
          if(recipient.includes('timeout@'))continue;
          if(recipient.includes('reject@'))s.write('554 submission rejected\r\n');
          else {state.accepted++;s.write('250 queued receipt-123\r\n');} continue;
        }
        if(/^EHLO|^HELO/i.test(line))s.write('250 sink\r\n');
        else if(/^MAIL FROM/i.test(line))s.write('250 ok\r\n');
        else if(/^RCPT TO/i.test(line)){recipient=line;s.write('250 ok\r\n');}
        else if(line==='DATA'){data=true;s.write('354 continue\r\n');}
        else s.end('221 bye\r\n');
      }
    });
  });
  await new Promise(r=>smtp.listen(0,'127.0.0.1',r));t.after(()=>smtp.close());
  const dns=dgram.createSocket('udp4');dns.on('message',(q,r)=>{
    let i=12;const labels=[];while(q[i]){const n=q[i++];labels.push(q.subarray(i,i+n).toString());i+=n;}
    const txt=Buffer.from(labels[0]==='_dmarc'?'v=DMARC1; p=reject':labels.includes('_domainkey')?'v=DKIM1; p=test':'v=spf1 -all');
    const head=Buffer.from(q.subarray(0,i+5));head.writeUInt16BE(0x8180,2);head.writeUInt16BE(state.verified?1:0,6);head.writeUInt32BE(0,8);
    const answer=Buffer.from([192,12,0,16,0,1,0,0,0,0,0,txt.length+1,txt.length]);
    dns.send(state.verified?Buffer.concat([head,answer,txt]):head,r.port,r.address);
  });await new Promise(r=>dns.bind(0,'127.0.0.1',r));t.after(()=>dns.close());
  return Object.assign(state,{port:smtp.address().port,dnsPort:dns.address().port});
};

const { parse } = require("cookieparser");

const BASE_URL=process.env.OLLAMA_URL || "http://localhost:11434";

const NOT_REACHABLE="ollama is not reachable is it running?";

const listModels=async ()=>{
    let res;
    try{
     res=await fetch(`${BASE_URL}/api/tags`);
    }
    catch(err){
    throw new Error(NOT_REACHABLE);
    }

    if(!res.ok){
        throw new Error(`ollama Error :${res.status}`);
    }

    const data=await res.json();
    return data.models.map((m)=>m.name);
}

// Turn one line of Ollama's output into an object
const parseLine=async ()=>{
    const obj=JSON.parse(line);
    if(obj.error) throw new Error('ollama Error ${res.status}');
    return obj;
}


// An async generator: the caller does `for await (const chunk of streamChat(...))`.
// Each chunk looks like { message: { role, content }, done: false }.
// The last chunk has done: true plus stats (token counts, durations).

async function*streamChat({models,message,signal,options}){
    let res;
    try{
     res=await fetch(`${BASE_URL}/api/chats`,{
     method:"POST",
     headers:{"Content-Type":"application/json"},
     body:JSON.stringify({models,message,stream:true,options}),
     signal,
     });
    }
    catch(err){
    if(err.name=== "AbortError")
        throw new Error(NOT_REACHABLE);
    }

    // e.g. unknown model name: Ollama replies with a non-200 and { error: "..." }

    if (!res.ok) {
    const text = await res.text();
    let message = text;
    try {
      message = JSON.parse(text).error || text;
    } catch {
    }
    throw new Error(`Ollama error: ${message}`);
  }

    // A network chunk is NOT guaranteed to be one whole JSON line. It can hold
  // half a line or three lines, so we keep a buffer of unfinished text.
  const decoder = new TextDecoder();
  let buffer = "";
 
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true }); // stream: true keeps split characters intact
    const lines = buffer.split("\n");
    buffer = lines.pop(); // the last piece may be incomplete; keep it for next time
 
    for (const line of lines) {
      if (line.trim()) yield parseLine(line);
    }
  }
 
  if (buffer.trim()) yield parseLine(buffer); // anything left at the end
}

module.exports={listModels,streamChat};
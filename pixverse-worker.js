const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

const API_BASE = "https://app-api.pixverse.ai/openapi/v2";

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
    const url = new URL(request.url);
    try {
      if (url.pathname === "/health" && request.method === "GET") {
        return json({ ok: true, worker: "THUY AI VIDEO - PIXVERSE", model: "v6" }, 200);
      }
      if (!env.PIXVERSE_API_KEY) return json({ ok: false, error: "MISSING_PIXVERSE_API_KEY", message: "Chưa đặt secret PIXVERSE_API_KEY trên Cloudflare Worker." }, 500);
      if (url.pathname === "/upload-image" && request.method === "POST") return await uploadImage(request, env);
      if (url.pathname === "/generate-fusion" && request.method === "POST") return await generateFusion(request, env);
      if (url.pathname === "/status" && request.method === "GET") {
        const id = url.searchParams.get("video_id");
        if (!id) return json({ ok:false, error:"VIDEO_ID_REQUIRED" }, 400);
        return await pixFetch(`/video/result/${encodeURIComponent(id)}`, { method:"GET" }, env);
      }
      if (url.pathname === "/lipsync" && request.method === "POST") return await lipSync(request, env);
      return json({ ok:false, error:"NOT_FOUND", routes:["/health","/upload-image","/generate-fusion","/status?video_id=...","/lipsync"] }, 404);
    } catch (e) {
      return json({ ok:false, error:"WORKER_EXCEPTION", message: e?.message || String(e) }, 500);
    }
  }
};

async function uploadImage(request, env) {
  const form = await request.formData();
  const image = form.get("image");
  if (!(image instanceof File)) return json({ ok:false, error:"IMAGE_REQUIRED" }, 400);
  if (!image.type.startsWith("image/")) return json({ ok:false, error:"IMAGE_TYPE_UNSUPPORTED" }, 400);
  if (image.size > 20 * 1024 * 1024) return json({ ok:false, error:"IMAGE_TOO_LARGE", message:"Ảnh phải nhỏ hơn 20MB." }, 400);
  const body = new FormData();
  body.append("image", image, image.name || "reference.jpg");
  const trace = crypto.randomUUID();
  const r = await fetch(`${API_BASE}/image/upload`, { method:"POST", headers:{ "API-KEY": env.PIXVERSE_API_KEY, "Ai-trace-id": trace }, body });
  return proxyPixResponse(r, { operation:"upload-image", trace });
}

async function generateFusion(request, env) {
  const input = await request.json();
  const imgId = Number(input.img_id);
  const prompt = String(input.prompt || "").trim();
  if (!Number.isInteger(imgId) || imgId <= 0) return json({ ok:false, error:"IMG_ID_REQUIRED" }, 400);
  if (!prompt) return json({ ok:false, error:"PROMPT_REQUIRED" }, 400);
  const duration = clampInt(input.duration, 1, 15, 6);
  const quality = ["360p","540p","720p","1080p"].includes(input.quality) ? input.quality : "540p";
  const aspect = ["16:9","4:3","1:1","3:4","9:16","2:3","3:2","21:9"].includes(input.aspect_ratio) ? input.aspect_ratio : "9:16";
  const model = input.model === "c1" ? "c1" : "v6";
  const seed = Number.isInteger(input.seed) ? input.seed : 0;
  const body = {
    image_references: [{ type:"subject", img_id:imgId, ref_name:"main_character" }],
    prompt: prompt.includes("@main_character") ? prompt : `@main_character ${prompt}`,
    model, duration, quality, aspect_ratio:aspect, seed
  };
  if (typeof input.generate_audio_switch === "boolean") body.generate_audio_switch = input.generate_audio_switch;
  const trace = crypto.randomUUID();
  const r = await fetch(`${API_BASE}/video/fusion/generate`, { method:"POST", headers:{ "API-KEY":env.PIXVERSE_API_KEY, "Ai-trace-id":trace, "Content-Type":"application/json" }, body:JSON.stringify(body) });
  return proxyPixResponse(r, { operation:"fusion", trace });
}

async function lipSync(request, env) {
  const input = await request.json();
  const sourceVideoId = Number(input.source_video_id);
  const text = String(input.lip_sync_tts_content || "").trim();
  if (!Number.isInteger(sourceVideoId) || sourceVideoId <= 0) return json({ ok:false, error:"SOURCE_VIDEO_ID_REQUIRED" }, 400);
  if (!text) return json({ ok:false, error:"TTS_CONTENT_REQUIRED" }, 400);
  if ([...text].length > 200) return json({ ok:false, error:"TTS_TOO_LONG", message:"PixVerse giới hạn TTS tối đa 200 ký tự." }, 400);
  const speaker = String(input.lip_sync_tts_speaker_id || "auto");
  const body = { source_video_id:sourceVideoId, lip_sync_tts_speaker_id:speaker, lip_sync_tts_content:text };
  const trace = crypto.randomUUID();
  const r = await fetch(`${API_BASE}/video/lip_sync/generate`, { method:"POST", headers:{ "API-KEY":env.PIXVERSE_API_KEY, "Ai-trace-id":trace, "Content-Type":"application/json" }, body:JSON.stringify(body) });
  return proxyPixResponse(r, { operation:"lipsync", trace });
}

async function pixFetch(path, init, env) {
  const headers = new Headers(init.headers || {});
  headers.set("API-KEY", env.PIXVERSE_API_KEY);
  headers.set("Ai-trace-id", crypto.randomUUID());
  const r = await fetch(`${API_BASE}${path}`, { ...init, headers });
  return proxyPixResponse(r, { operation:"status" });
}

async function proxyPixResponse(r, meta) {
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw:text }; }
  const ok = r.ok && data?.ErrCode === 0;
  return json({ ok, http_status:r.status, ...meta, pixverse:data }, r.ok ? 200 : r.status);
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function json(data, status=200) {
  const headers = new Headers(corsHeaders);
  headers.set("Content-Type", "application/json; charset=UTF-8");
  return new Response(JSON.stringify(data), { status, headers });
}

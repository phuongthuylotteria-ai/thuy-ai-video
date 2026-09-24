(function () {
  'use strict';

  var WORKER = 'https://thuy-ai-video-api.phuongthuy-lotteria.workers.dev';
  var SCRIPT = 'https://script.google.com/macros/s/AKfycbzpIjAWninGb2hXQHezLSvRfd2G8TBFb8FRCjQkIjm-5Buyfbw6HjgTCl2sN9Stou2M/exec';
  var currentScript = null;
  var imageId = null;

  function byId(id) { return document.getElementById(id); }

  function message(text, type) {
    var box = byId('status');
    if (!box) return;
    box.hidden = false;
    box.className = 'status ' + (type || 'info');
    box.textContent = text;
  }

  function faceMessage(text, type) {
    var box = byId('faceStatus');
    if (!box) return;
    box.hidden = false;
    box.className = 'status ' + (type || 'info');
    box.textContent = text;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function api(path, options) {
    var opts = options || {};
    opts.mode = 'cors';
    opts.credentials = 'omit';
    opts.cache = 'no-store';
    return fetch(WORKER + path, opts).then(function (response) {
      return response.text().then(function (raw) {
        var data;
        try { data = JSON.parse(raw); } catch (e) { throw new Error('Worker trả về dữ liệu không hợp lệ. HTTP ' + response.status); }
        if (!response.ok || data.ok === false) {
          var p = data.pixverse || {};
          throw new Error(p.ErrMsg || data.message || data.error || ('HTTP ' + response.status));
        }
        return data;
      });
    }).catch(function (error) {
      if (error && error.message) throw error;
      throw new Error('Không kết nối được PixVerse Worker.');
    });
  }

  window.thuyHealth = function () {
    message('Đang kiểm tra kết nối PixVerse...', 'info');
    api('/health?ts=' + Date.now()).then(function (data) {
      message('Kết nối thành công — ' + (data.worker || 'THUY AI VIDEO - PIXVERSE') + ' — model ' + (data.model || 'v6'), 'ok');
    }).catch(function (error) {
      message(error.message, 'bad');
    });
  };

  function fallbackScript() {
    var topic = byId('topic').value || 'kem chống nắng';
    var durationText = byId('duration').value || '30 giây';
    var match = durationText.match(/\d+/);
    var total = match ? Number(match[0]) : 30;
    var count = total <= 15 ? 2 : total <= 30 ? 4 : 6;
    var each = total <= 15 ? 5 : 8;
    var scenes = [];
    var i;
    for (i = 0; i < count; i += 1) {
      scenes.push({
        duration_seconds: each,
        visual_description: 'Cùng một phụ nữ Việt Nam khoảng 30 tuổi, khuôn mặt, tóc và trang phục nhất quán. Bối cảnh sáng, sang trọng. Nội dung: ' + topic + '.',
        dialogue: i === 0 ? 'Chị em mình đừng bỏ qua điều này nhé!' : (i === count - 1 ? 'Nếu thấy hữu ích, hãy theo dõi mình nhé!' : 'Đây là điều mình muốn chia sẻ hôm nay.'),
        video_prompt: 'Vertical 9:16 realistic cinematic video, same Vietnamese woman, consistent face, hair and outfit, natural movement, soft lighting, no subtitles, no text, no watermark.'
      });
    }
    return { title: 'Kịch bản TikTok ' + topic, total_duration_seconds: count * each, scenes: scenes };
  }

  function parseScript(value) {
    var text = value;
    if (value && value.result) text = value.result;
    if (typeof text !== 'string') return value;
    text = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    try { return JSON.parse(text); } catch (e) {
      var a = text.indexOf('{');
      var b = text.lastIndexOf('}');
      if (a >= 0 && b > a) {
        try { return JSON.parse(text.substring(a, b + 1)); } catch (x) {}
      }
    }
    return null;
  }

  function renderScript(data) {
    currentScript = data;
    var box = byId('box');
    var scenes = byId('scenes');
    var summary = byId('summary');
    box.hidden = false;
    summary.innerHTML = '<b>' + escapeHtml(data.title || 'Kịch bản video') + '</b><br>Tổng thời lượng: ' + escapeHtml(data.total_duration_seconds || '') + ' giây';
    scenes.innerHTML = '';

    data.scenes.forEach(function (scene, index) {
      var duration = Number(scene.duration_seconds) === 8 ? 8 : 5;
      var html = '<section class="scene">' +
        '<b>🎬 CẢNH ' + (index + 1) + ' — ' + duration + ' giây</b>' +
        '<p><b>Hình ảnh:</b> ' + escapeHtml(scene.visual_description) + '</p>' +
        '<p><b>Lời thoại:</b> ' + escapeHtml(scene.dialogue) + '</p>' +
        '<p><b>Prompt video:</b> ' + escapeHtml(scene.video_prompt) + '</p>' +
        '<button class="btn orange" onclick="thuyCreateScene(' + index + ')">🎬 TẠO CẢNH NÀY</button>' +
        '<div id="sceneStatus' + index + '" class="status" hidden></div>' +
        '</section>';
      scenes.insertAdjacentHTML('beforeend', html);
    });
  }

  window.thuyWriteScript = function () {
    var button = byId('script');
    button.disabled = true;
    message('Đang tạo kịch bản...', 'info');

    var callbackName = 'thuyAI_' + Date.now();
    var scriptTag = document.createElement('script');
    var finished = false;
    var timer = setTimeout(function () { finish(null, new Error('AI phản hồi quá lâu. Hệ thống chuyển sang kịch bản dự phòng.')); }, 12000);

    function finish(data, error) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      scriptTag.remove();
      try { delete window[callbackName]; } catch (e) { window[callbackName] = undefined; }
      button.disabled = false;
      if (data) {
        var parsed = parseScript(data);
        if (parsed && parsed.scenes && parsed.scenes.length) {
          renderScript(parsed);
          message('Đã tạo kịch bản bằng AI.', 'ok');
          return;
        }
      }
      renderScript(fallbackScript());
      message('Đã tạo kịch bản dự phòng để bạn có thể tiếp tục tạo video.', 'ok');
    }

    window[callbackName] = function (data) { finish(data, null); };
    scriptTag.onerror = function () { finish(null, new Error('Không kết nối AI trung gian.')); };

    var params = new URLSearchParams();
    params.set('callback', callbackName);
    params.set('prompt', 'Viết kịch bản TikTok tiếng Việt. Chủ đề: ' + byId('topic').value + '. Thời lượng: ' + byId('duration').value + '. Phong cách: ' + byId('style').value + '. Đối tượng: ' + byId('audience').value + '. Trả JSON duy nhất gồm title,total_duration_seconds,scenes. Mỗi scene có duration_seconds là NUMBER chỉ 5 hoặc 8, visual_description, dialogue, video_prompt.');
    scriptTag.src = SCRIPT + '?' + params.toString();
    document.body.appendChild(scriptTag);
  };

  function uploadImage(file) {
    var form = new FormData();
    form.append('image', file, file.name || 'reference.jpg');
    return api('/upload-image', { method: 'POST', body: form }).then(function (data) {
      var id = data.pixverse && data.pixverse.Resp && data.pixverse.Resp.img_id;
      if (!id) throw new Error('PixVerse không trả về img_id.');
      return id;
    });
  }

  window.thuyCreateScene = function (index) {
    if (!currentScript || !currentScript.scenes[index]) { message('Chưa có kịch bản.', 'bad'); return; }
    var file = byId('face').files[0];
    if (!file) { faceMessage('Hãy chọn ảnh nhân vật trước.', 'bad'); return; }
    var status = byId('sceneStatus' + index);
    status.hidden = false;
    status.className = 'status info';
    status.textContent = 'Đang tải ảnh và gửi cảnh lên PixVerse...';

    var scene = currentScript.scenes[index];
    var duration = Number(scene.duration_seconds) === 8 ? 8 : 5;
    var prompt = (scene.video_prompt || scene.visual_description || '') + ' Keep the same face, hair, skin tone and outfit. Vertical 9:16. Realistic human movement. No subtitles. No text. No watermark.';
    var uploadPromise = imageId ? Promise.resolve(imageId) : uploadImage(file);
    uploadPromise.then(function (id) {
      imageId = id;
      return api('/generate-fusion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ img_id: id, prompt: prompt, duration: duration, quality: byId('quality').value || '720p', aspect_ratio: '9:16', model: 'v6' })
      });
    }).then(function (data) {
      var videoId = data.pixverse && data.pixverse.Resp && data.pixverse.Resp.video_id;
      if (!videoId) throw new Error('PixVerse không trả về video_id.');
      status.textContent = 'Đã gửi PixVerse. Đang chờ video...';
      return waitVideo(videoId);
    }).then(function (url) {
      status.className = 'status ok';
      status.innerHTML = '✅ Cảnh hoàn tất<br><video controls playsinline class="video" src="' + escapeHtml(url) + '"></video><br><a target="_blank" rel="noopener" href="' + escapeHtml(url) + '">Mở video</a>';
    }).catch(function (error) {
      status.className = 'status bad';
      status.textContent = error.message || 'Tạo cảnh thất bại.';
    });
  };

  function waitVideo(videoId) {
    var tries = 0;
    function check() {
      tries += 1;
      if (tries > 120) return Promise.reject(new Error('Cảnh xử lý quá lâu.'));
      return api('/status?video_id=' + encodeURIComponent(videoId)).then(function (data) {
        var response = data.pixverse && data.pixverse.Resp ? data.pixverse.Resp : {};
        if (response.status === 1 && response.url) return response.url;
        if (response.status === 7) throw new Error('PixVerse từ chối cảnh do kiểm duyệt.');
        if (response.status === 8) throw new Error('PixVerse tạo cảnh thất bại.');
        return new Promise(function (resolve) { setTimeout(resolve, 4000); }).then(check);
      });
    }
    return check();
  }

  window.thuyAuto = function () {
    var button = byId('auto');
    var file = byId('face').files[0];
    if (!file) { faceMessage('Hãy chọn ảnh nhân vật trước.', 'bad'); return; }
    button.disabled = true;
    message('Đang tạo kịch bản...', 'info');
    window.thuyWriteScript();
    var wait = setInterval(function () {
      if (currentScript) {
        clearInterval(wait);
        var chain = Promise.resolve();
        currentScript.scenes.forEach(function (_, index) { chain = chain.then(function () { return createSceneForAuto(index); }); });
        chain.then(function () { message('Đã xử lý xong các cảnh.', 'ok'); }).catch(function (e) { message(e.message, 'bad'); }).finally(function () { button.disabled = false; });
      }
    }, 500);
    setTimeout(function () { clearInterval(wait); if (!currentScript) { button.disabled = false; } }, 20000);
  };

  function createSceneForAuto(index) {
    return new Promise(function (resolve, reject) {
      var old = window.thuyCreateScene;
      var scene = currentScript.scenes[index];
      var file = byId('face').files[0];
      var status = byId('sceneStatus' + index);
      status.hidden = false;
      status.className = 'status info';
      status.textContent = 'Đang tạo cảnh...';
      var duration = Number(scene.duration_seconds) === 8 ? 8 : 5;
      var p = imageId ? Promise.resolve(imageId) : uploadImage(file);
      p.then(function (id) {
        imageId = id;
        return api('/generate-fusion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ img_id: id, prompt: scene.video_prompt || scene.visual_description, duration: duration, quality: byId('quality').value || '720p', aspect_ratio: '9:16', model: 'v6' }) });
      }).then(function (data) {
        var videoId = data.pixverse && data.pixverse.Resp && data.pixverse.Resp.video_id;
        if (!videoId) throw new Error('PixVerse không trả về video_id.');
        status.textContent = 'Đang chờ video...';
        return waitVideo(videoId);
      }).then(function (url) {
        status.className = 'status ok';
        status.innerHTML = '✅ Hoàn tất<br><video controls playsinline class="video" src="' + escapeHtml(url) + '"></video>';
        resolve();
      }).catch(function (e) {
        status.className = 'status bad';
        status.textContent = e.message;
        reject(e);
      });
    });
  }

  window.addEventListener('DOMContentLoaded', function () {
    byId('health').onclick = window.thuyHealth;
    byId('script').onclick = window.thuyWriteScript;
    byId('auto').onclick = window.thuyAuto;
    byId('face').onchange = function () {
      imageId = null;
      if (this.files[0]) faceMessage('Đã chọn ảnh: ' + this.files[0].name, 'ok');
    };
    message('Sẵn sàng. Các nút đã được kết nối.', 'ok');
  });
})();

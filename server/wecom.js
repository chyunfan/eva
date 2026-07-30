'use strict';

// 企业微信鉴权模块。
// 流程：前端打开 H5 -> 网页授权 snsapi_base -> 企微回调带 code
//       -> 后端 code 换 userid (auth/getuserinfo)
//       -> userid 换通讯录详情 (user/get)，取 姓名 + 柜员号(extattr 自定义字段)
//
// 重要：corpsecret 只存在于后端配置，绝不暴露给前端。

const https = require('https');
const { URL } = require('url');

function requestJson(urlStr) {
  return new Promise((resolve, reject) => {
    https.get(urlStr, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function buildAuthUrl(cfg) {
  // 网页授权入口，企业微信用户点击后跳转到 redirectUri 并带上 code
  const base = 'https://open.weixin.qq.com/connect/oauth2/authorize';
  const params = new URLSearchParams({
    appid: cfg.wecom.corpid,
    redirect_uri: cfg.wecom.redirectUri,
    response_type: 'code',
    scope: 'snsapi_base',
    state: 'dept-eval'
  });
  return `${base}?${params.toString()}#wechat_redirect`;
}

async function getAccessToken(cfg) {
  const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${cfg.wecom.corpid}&corpsecret=${cfg.wecom.corpsecret}`;
  const data = await requestJson(url);
  if (!data.access_token) throw new Error('获取 access_token 失败: ' + JSON.stringify(data));
  return data.access_token;
}

async function codeToUserid(cfg, code) {
  const token = await getAccessToken(cfg);
  const url = `https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo?access_token=${token}&code=${code}`;
  const data = await requestJson(url);
  if (!data.userid) throw new Error('code 换 userid 失败: ' + JSON.stringify(data));
  return data.userid;
}

// 从通讯录详情取姓名与柜员号；柜员号位于 extattr 自定义字段，按名称「柜员号」匹配。
function extractTellerNo(user) {
  const ext = user.extattr && user.extattr.attrs;
  if (!ext) return null;
  const found = ext.find(a => a.name === '柜员号' || a.name === 'teller_no');
  return found ? found.value : null;
}

async function getUserDetail(cfg, userid) {
  const token = await getAccessToken(cfg);
  const url = `https://qyapi.weixin.qq.com/cgi-bin/user/get?access_token=${token}&userid=${encodeURIComponent(userid)}`;
  const data = await requestJson(url);
  if (data.errcode) throw new Error('获取通讯录失败: ' + JSON.stringify(data));
  return {
    userid: data.userid,
    name: data.name,
    teller_no: extractTellerNo(data)
  };
}

// 一键：code -> { name, teller_no }
async function resolveEvaluator(cfg, code) {
  const userid = await codeToUserid(cfg, code);
  return getUserDetail(cfg, userid);
}

module.exports = { buildAuthUrl, resolveEvaluator };

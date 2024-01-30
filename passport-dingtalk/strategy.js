'use strict';
/**
 * Module dependencies.
 */

/* eslint-disable */
const util = require('util');
const querystring = require('querystring');
const passport = require('passport-strategy');
const request = require('request');
const crypto = require("crypto");

// api_host: https://oapi.dingtalk.com
// https://open.dingtalk.com/document/orgapp/obtain-the-user-information-based-on-the-sns-temporary-authorization
// 1. 根据code获取 unionid /sns/getuserinfo_bycode
// 2. 获取阿皮调用token /gettoken
// 3. 根据unionid 获取 userinfo /topapi/user/getbyunionid
// 4. 根据uid获取用户信息 /topapi/v2/user/get
function DingTalkTokenStrategy(options, verify) {
  if (typeof options == 'function') {
    verify = options;
    options = {};
  }
  if (!verify) { throw new TypeError('LocalStrategy requires a verify callback'); }

  passport.Strategy.call(this);
  this.name = 'ding-token';
  this._verify = verify;

  // 请求地址
  this.authorizationURL = options.authorizationURL || 'https://oapi.dingtalk.com/connect/qrconnect';
  this.getUserInfoByCodeURL = 'https://oapi.dingtalk.com/sns/getuserinfo_bycode';
  this.tokenURL = options.tokenURL || 'https://oapi.dingtalk.com/gettoken';
  this.openIdURL = options.openIdURL || 'https://oapi.dingtalk.com/topapi/user/getbyunionid';
  this.userInfoURL = options.userInfoURL || 'https://oapi.dingtalk.com/topapi/v2/user/get';
  this.clientID = options.clientID
  this.clientSecret = options.clientSecret
  this.access_token = ''

  //添加passReqToCallback
  this.passReqToCallback = options.passReqToCallback || false;

  // 1. 根据code获取 unionid /sns/getuserinfo_bycode
  this._authorizationCodeUrlParams = {
    response_type: 'code',
    appid: options.clientID,
    redirect_uri: options.callbackURL,
    scope: options.scope || 'snsapi_login',
    state: 'STATE',
  };
}

/**
 * Inherit from `Strategy`.
 */
util.inherits(DingTalkTokenStrategy, passport.Strategy);


const get = (url) => {
  return new Promise((res, rej) => {
    request({
      type: 'GET',
      uri: url
    }, (err, response, body) => {
      if (err) rej(err);
      res(body);
    });
  });
}

DingTalkTokenStrategy.prototype.sha1Sign = function(str) {
	const hmac = crypto.createHmac('sha256', this.clientSecret);
	return hmac.update(str).digest('base64')
}

DingTalkTokenStrategy.prototype.gettoken = function() {
	let urlParams = {
		appkey: this.clientID,
		appsecret: this.clientSecret
	}
	const url = this.tokenURL + '?' + querystring.stringify(urlParams);
	return get(url)
}

// 根据uid获取用户信息 /topapi/v2/user/get
DingTalkTokenStrategy.prototype.getDingUser = function(userid, language) {
	let urlParams = {
		access_token: this.access_token
	}
	const url = this.userInfoURL + '?' + querystring.stringify(urlParams);
	const bodyPayload = {
		userid,
		language,
	}
	return new Promise((res, rej) => {
		request.post(url, { json: bodyPayload }, (err, response, body) => {
			if (err) rej(err);
			res(body);
		  })
	})
}

DingTalkTokenStrategy.prototype.getbyunionid = function(unionid, access_token) {
	let urlParams = {
		access_token
	}
	const url = this.openIdURL + '?' + querystring.stringify(urlParams);
	const bodyPayload = {
		unionid
	}
	return new Promise((res, rej) => {
		request.post(url, { json: bodyPayload }, (err, response, body) => {
			if (err) rej(err);
			res(body);
		  })
	})
}

DingTalkTokenStrategy.prototype.getUserInfoByCode = function(code) {
	const timestamp = new Date().getTime()
	const signature = this.sha1Sign(timestamp+'')
	let urlParams = {
		accessKey: this.clientID,
		timestamp,
		signature,
	}
    const url = this.getUserInfoByCodeURL + '?' + querystring.stringify(urlParams);
	const bodyPayload = {
		"tmp_auth_code": code,
	}
	return new Promise((res, rej) => {
		request.post(url, { json: bodyPayload }, (err, response, body) => {
			if (err) rej(err);
			res(body);
		  })
	})
}

DingTalkTokenStrategy.prototype.authenticate = function (req, options) {
  const authorizationCodeUrlParams = Object.assign({}, this._authorizationCodeUrlParams);

  let url;
  let refresh_token;
  let unionid;
  let profile = {};

  if (req.query && req.query.code) {
	this.getUserInfoByCode(req.query.code).then((result) => {
		// const result = querystring.parse(data);
		console.log('getUserInfoByCode =>>', req.query.code, result.user_info)
		// if (result.errcode != 0) {
		// 	return this.fail(result.errmsg);
		// }
		unionid = result.user_info.unionid;
		profile.openid = result.user_info.openid;
		profile.nick = result.user_info.nick;
		// unionid: '2dXMphZcxTfiSVKxsFOAqWAiEiE',
		// dingId: '$:LWCP_v1:$iiIvFHsq9xgN4QMc42LTBLiK9m6KdxTl',
		// openid: '046s1bhiSAleiip8lux7C5dgiEiE',
		// 2. 获取阿皮调用token /gettoken
		return this.gettoken()
        // return this.fail(result);
	}).then((data) => {
		// access_token
		// expires_in // 秒
		// errmsg
		// errcode
		const result = JSON.parse(data)
		// console.log('获取token', data, result)
		this.access_token = result.access_token
		return this.getbyunionid(unionid, this.access_token)
	}).then((resp) => {
		const result = resp.result
		// console.log('获取getbyunionid >>', resp, result)
		// contact_type: 0：企业内部员工 	1：企业外部联系人
		profile.contact_type = result.contact_type
		return this.getDingUser(result.userid, 'zh_CN')
	}).then((resp) => {
		profile = Object.assign(profile, resp.result)
		// console.log('获取getDingUser 》', profile)
		const verified = (err, user, info) => {
			if (err) {
				return this.error(err);
			}
			if (!user) {
				return this.fail(info);
			}
			this.success(user, info);
		}

		// 添加passReqToCallback
		if (this.passReqToCallback) {
			// 如果设置成true的话
			this._verify(req, this.access_token, refresh_token, profile, verified);
		} else {
			//否则就返回成原来的形式
			this._verify(this.access_token, refresh_token, profile, verified);
		}
	}).catch(err => {
        //把错误抛出，方便调试
        console.log(`[dingtalk]catch a error;`, err);
        return this.fail(err);
	});
  } else {
    url = this.authorizationURL + '?' + querystring.stringify(authorizationCodeUrlParams);
    this.redirect(url);
  }
};


/**
 * Expose `Strategy`.
 */
module.exports.Strategy = DingTalkTokenStrategy;
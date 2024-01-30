'use strict';

(function (module) {
	const axios = require('axios');
	const User = require.main.require('./src/user');
	const meta = require.main.require('./src/meta');
	const db = require.main.require('./src/database');
	const passport = require.main.require('passport');
	const passportDingtalk = require('./passport-dingtalk').Strategy;
	const TopicNotifications = require('./passport-dingtalk/topicnotice').TopicNotifications;

	const nconf = require.main.require('nconf');
	// const async = require.main.require('async');
	const async = require('async');
	const winston = require.main.require('winston');
	const authenticationController = require.main.require('./src/controllers/authentication');

	// 配置管理界面的菜单信息
	const constants = Object.freeze({
		name: '钉钉登录',
		admin: {
			icon: 'fa-users',
			route: '/plugins/dingtalk-auth',
		},
	});

	const Dingtalk = {
		settings: null
	};

	Dingtalk.getSettings = function (callback) {
		if (Dingtalk.settings) {
			return callback();
		}

		meta.settings.get('dingtalk-auth', function (err, settings) {
			Dingtalk.settings = settings;
			callback();
		});
	}
	/**
	 * passport策略初始化，见钩子
	 * @param {*} strategies
	 * @param {*} callback
	 */
	Dingtalk.getStrategy = function (strategies, callback) {
		if (!Dingtalk.settings) {
			return Dingtalk.getSettings(function () {
				Dingtalk.getStrategy(strategies, callback);
			});
		}
		// meta.settings.get('dingtalk-auth', (err, settings) => {
		// });
		const settings = Dingtalk.settings
		if (settings.id && settings.secret) {
			passport.use(
				'dingtalk',
				new passportDingtalk(
					{
						clientID: settings.id,
						clientSecret: settings.secret,
						callbackURL: `${nconf.get('url')}/auth/dingtalk/callback`,
						scope: 'snsapi_login',
						passReqToCallback: true,
					},
					(async (req, accessToken, refreshToken, profile, done) => {
						// profile : {
						// 	nick, // 钉钉名
						// 	unionid, // 某企业内唯一id
						// 		dingId,
						// 		openid
						// }
						// console.log('====>获取钉钉信息3,accessToken,refreshToken', accessToken, refreshToken, profile,done);
						// 如果uid大于0
						if (
							req.hasOwnProperty('user') &&
							req.user.hasOwnProperty('uid') &&
							req.user.uid > 0
						) {
							// 已有用户，如果用户想绑定一个以上的NodeBB用户，我们拒绝他/她。
							Dingtalk.hasDingTalkUnionid(profile.unionid, (err, res) => {
								if (err) {
									winston.error(err);
									return done(err);
								}
								if (res) {
									return done(
										new Error(
											'You have binded a Dingtalk account.If you want to bind another one ,please unbind your account.'
										),
										false
									);
								}
								//
								winston.info(
									`[SSO-Dingtalk-web] ${req.user.uid} is binded.(openid is ${profile.openid} and nickname is ${profile.nick}`
								);
								// 更新信息
								return done(null, req.user);
							});
						} else {
							// 如果没有uid
							// 登录
							console.log('创建用户==》', profile, req.session);
							Dingtalk.login(
								profile,
								accessToken,
								refreshToken,
								(err, user) => {
									console.log('====>登录回调',err, user);
									if (err) {
										return done(err);
									}
									// 登录成功
									authenticationController.onSuccessfulLogin(
										req,
										user.uid,
										(err) => {
											if (err) {
												return done(err);
											}
											done(null, user);
										}
									);
								}
							);
						}
					})
				)
			);
		}

		strategies.push({
			name: 'dingtalk',
			url: '/auth/dingtalk',
			callbackURL: '/auth/dingtalk/callback',
			icon: {
				normal: 'fa-users',
			},
			labels: {
				login: '[[dingtalk-auth:login]]',
				register: '[[dingtalk-auth:login]]',
			},
			scope: '',
		});

		callback(null, strategies);
	};

	/**
	 *  初始化见钩子
	 * @param {*} data
	 * @param {*} callback
	 */
	Dingtalk.init = function (data, callback) {
		const hostHelpers = require.main.require('./src/routes/helpers');
		hostHelpers.setupAdminPageRoute(data.router, '/admin/plugins/dingtalk-auth', (req, res) => {
			res.render('admin/plugins/dingtalk-auth', {
				title: 'dingtalk',
				baseUrl: nconf.get('url'),
				callbackURL: `${nconf.get('url')}/auth/dingtalk/callback`,
			});
		});

		function renderAdmin(req, res) {
			res.render('admin/plugins/dingtalk-auth', {
				callbackURL: `${nconf.get('url')}/auth/dingtalk/callback`,
			});
		}

		data.router.get('/admin/plugins/dingtalk-auth', data.middleware.admin.buildHeader, renderAdmin);
		data.router.get('/api/admin/plugins/dingtalk-auth', renderAdmin);
		data.router.get('/auth/dingtalk/callback', (req, res, next) => {
			req.query.state = req.session.ssoState;
			next();
		});

		hostHelpers.setupPageRoute(data.router, '/deauth/dingtalk', [data.middleware.requireUser], function (req, res) {
			res.render('plugins/dingtalk-auth/deauth', {
				service: "DingTalk",
			});
		});

		// 解绑钉钉
		data.router.post('/deauth/dingtalk', [data.middleware.requireUser, data.middleware.applyCSRF], function (req, res, next) {
            // TODO: 如果只存在一个绑定,删除账户
			Dingtalk.deleteUserData({
                uid: req.user.uid
            }, function (err, uid) {
                if (err) {
                    return next(err)
                }

				res.redirect(nconf.get('relative_path') + '/me/edit');
            });
        });
		callback();
	};

	/**
	 * 字段白名单，见钩子
	 * @param {*} data
	 * @param {*} callback
	 */
	Dingtalk.appendUserHashWhitelist = async ({ uids, whitelist }) => {
		whitelist.push('unionid');
		return { uids, whitelist };
	};

	// 主题变更通知：action:topic.changeOwner
	Dingtalk.topicChangeOwner = async function (data) {
		const { topics, toUid } = data;
		// topics： 'tid', 'cid', 'deleted', 'title', 'uid', 'mainPid', 'timestamp',
		if (!Dingtalk.settings) {
			return Dingtalk.getSettings(function () {
				return Dingtalk.topicChangeOwner(data);
			});
		}

		console.log('主题变更通知 >>', topics, toUid)
		const topicNotices = new TopicNotifications(Dingtalk.settings)
		topicNotices.topicChangeOwnerNotices(topics, toUid)
		return data
	}

	// 帖子变更邮件通知
	// action:post.changeOwner
	Dingtalk.postChangeOwner = function (data) {
		const { posts, toUid } = data;
		if (!Dingtalk.settings) {
			return Dingtalk.getSettings(function () {
				return Dingtalk.postChangeOwner(data);
			});
		}

		console.log('帖子变更邮件通知 >>',TopicNotifications, posts, toUid)
		// const topicNotices = new TopicNotifications({})
		// topicNotices.topicChangeOwnerNotices(data.posts, toUid)
		return data
	}

	Dingtalk.getAssociation = function (data, callback) {
		User.getUserField(data.uid, 'unionid', function (err, unionid) {
			if (err) {
				return callback(err, data);
			}

			if (unionid) {
				data.associations.push({
					associated: true,
					url: '',
					deauthUrl: nconf.get('url') + '/deauth/dingtalk',
					name: constants.name,
					icon: constants.admin.icon
				});
			} else {
				data.associations.push({
					associated: false,
					url: nconf.get('url') + '/auth/dingtalk',
					name: constants.name,
					icon: constants.admin.icon
				});
			}

			callback(null, data);
		})
	};

	/**
	 * 添加菜单项，见钩子
	 * @param {*} header
	 * @param {*} callback
	 */
	Dingtalk.addMenuItem = function (header, callback) {
		header.authentication.push({
			route: constants.admin.route,
			icon: constants.admin.icon,
			name: constants.name,
		});

		callback(null, header);
	};



	Dingtalk.deleteUserData = function (data, callback) {
		console.log('解绑用户 =>>', data);
		async.waterfall([
            async.apply(User.getUserField, data.uid, 'unionid'),
            function (oAuthIdToDelete, next) {
                db.deleteObjectField('unionid:uid', oAuthIdToDelete, next);
            },
        ], (err) => {
            if (err) {
                winston.error(`[[oauth2-dingtalk:removeError]] ${err}`);
                return callback(err);
            }

            callback(null, data);
        });
	};

	/**
	 * 登录处理方法
	 * @param {*} unionid
	 * @param {*} openid
	 * @param {*} nick
	 * @param {*} accessToken
	 * @param {*} refreshToken
	 * @param {*} callback
	 */
	Dingtalk.login = function (
		profile,
		accessToken,
		refreshToken,
		callback
	) {
		Dingtalk.getUidByDingtalkUnionid(profile.unionid, async (err, uid) => {
			if (err) {
				return callback(err);
			}
			// 用户存在更新
			if (uid !== null) {
				// Dingtalk.storeTokens(uid, accessToken, refreshToken);
				// // 更新用户信息
				// user.setUserFields(uid, userData, (err, user) => {
				// 	if (err) {
				// 		throw err;
				// 	}
				// });
				console.log('用户存在更新 >>', uid)
				callback(null, {
                    uid
                });
				return
			}

			// const userInfo = await Dingtalk.getUserInfoByUnionid(profile.unionid);

			// if (userInfo.errcode) {
			// 	return callback(new Error(JSON.stringify(userInfo)));
			// }

			// const _nickName = userInfo.extension ? JSON.parse(userInfo.extension)['花名'] : userInfo.name.split('（')[0];
			const userData = {
				username: profile.name || '',
				// userslug: _nickName || profile.name || '',
				username: profile.name || '',
				email: profile.email || `${profile.unionid}@lovewith.com`,
				picture: profile.avatar,
				// location: profile.work_place,
				// signature: '',
				// aboutme: '',
				// hired_date: profile.hired_date,
				// job_number: profile.job_number,
				mobile: profile.mobile,
				// remark: profile.remark,
				// title: profile.title,
				unionid: profile.unionid,
				// userid: profile.userid,
			};
			// 新用户
			const success = async function (uid) {
				// console.log('====>写入新用户uid信息NO.5', uid)
				// 添加用户信息
				User.setUserFields(uid, userData, (err, user) => {
					if (err) {
						throw err;
					}
				});

				db.setObjectField('unionid:uid', profile.unionid, uid);
				// db.setObjectField('openid:uid', openid, uid);
				// 自动认证
				const autoConfirm = 1;
				User.setUserField(uid, 'email:confirmed', autoConfirm);
				if (autoConfirm) {
					// db.sortedSetRemove('users:notvalidated', uid);
					await User.setUserField(uid, 'email', userData.email);
					await User.email.confirmByUid(uid);
				}

				// Dingtalk.storeTokens(uid, accessToken, refreshToken);

				callback(null, {
					uid: uid,
				});
			};

			// 邮箱不能为空
			User.create(userData, (err, uid) => {
			 	console.log('====>新用户NO.4-2===>', uid, userData)
				if (err) {
					console.log('====>新用户创建失败NO.4-3', uid, err);
					// 如果用户名是无效的
					User.create({
						username: userData.username + new Date().getTime(),
						email: `${profile.unionid}@lovewith.com`, ...userData
					}, (err, uid) => {
						if (err) {
							return callback(err);
						}
						success(uid);
					});
				} else {
					success(uid);
				}
			});
		});
		// 登录结束
	};

	/**
	 * 是否存在openid
	 * @param {*} openid
	 * @param {*} callback
	 */
	// Dingtalk.hasDingTalkOpenId = function (openid, callback) {
	// 	db.isObjectField('openid:uid', openid, function (err, res) {
	// 		if (err) {
	// 			return callback(err);
	// 		}
	// 		callback(null, res);
	// 	});
	// };


	/**
	 * 是否存在unionid
	 * @param {*} unionid
	 * @param {*} callback
	 */
	Dingtalk.hasDingTalkUnionid = function (unionid, callback) {
		db.isObjectField('unionid:uid', unionid, (err, res) => {
			if (err) {
				return callback(err);
			}
			callback(null, res);
		});
	};

	/**
	 * openid获取uid
	 * @param {*} openid
	 * @param {*} callback
	 */
	// Dingtalk.getUidByDingtalkOpenId = async function (openid, callback) {
	// 	db.getObjectField('openid:uid', openid, function (err, uid) {
	// 		if (err) {
	// 			callback(err);
	// 		} else {
	// 			callback(null, uid);
	// 		}
	// 	});
	// };

	/**
	 * unionid获取uid
	 * @param {*} unionid
	 * @param {*} callback
	 */
	Dingtalk.getUidByDingtalkUnionid = async function (unionid, callback) {
		// 这种横向关联方式 可以继续优化
		db.getObjectField('unionid:uid', unionid, (err, uid) => {
			if (err) {
				callback(err);
			} else {
				callback(null, uid);
			}
		});
	};

	/**
	 * 刷新token
	 * @param {*} uid
	 * @param {*} accessToken
	 * @param {*} refreshToken
	 */
	Dingtalk.storeTokens = function (uid, accessToken, refreshToken) {
		// JG: 实际上是保存有用的东西
		winston.info(
			`Storing received Dingtalk access information for uid(${
				uid
			}) accessToken(${
				accessToken
			}) refreshToken(${
				refreshToken
			})`
		);
		User.setUserField(uid, 'dingtalk_accessToken', accessToken);
		User.setUserField(uid, 'dingtalk_refreshToken', refreshToken);
	};

	module.exports = Dingtalk;
}(module));

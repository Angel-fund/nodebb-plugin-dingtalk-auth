'use strict';
// 主题变更通知
const Emailer = require.main.require('./src/emailer');
const Notifications = require.main.require('./src/notifications');
const Meta = require.main.require('./src/meta');
const User = require.main.require('./src/user');
const Nconf = require.main.require('nconf');

function TopicNotifications(settings) {
	this.settings = settings;
}

// 主题拥有者变更通知
TopicNotifications.prototype.topicChangeOwnerNotices = async function (topicData, uid) {
	// const settings = await meta.settings.get('category-notifications');
	const notice_type = this.settings.notice_type || 'email';
	/*
	 topic: [{'tid', 'cid', 'deleted', 'title', 'uid', 'mainPid', 'timestamp'}]
	*/
	switch (notice_type) {
		case 'notification':
			await sendTopicChangeOwnerNotification(topicData, uid);
			break
		case 'both':
			await Promise.all([
				sendTopicChangeOwnerEmail(topicData, uid),
				sendTopicChangeOwnerNotification(topicData, uid),
			]);
			break
		default:
			// 邮件通知
			await sendTopicChangeOwnerEmail(topicData, uid);
	}
}

// 发送站内信
async function sendTopicChangeOwnerNotification(topics, uid) {
	const topic = Array.isArray(topics) ? topics[0] : topics;
	console.log('\n发送站内信通知》》\n', topic)
	// const notification = await Notifications.create({
	// 	bodyShort: `[[notifications:user_posted_topic, ${topic.user.username}, ${topic.title}]]`,
	// 	bodyLong: topic.mainPost.content,
	// 	pid: topic.mainPid,
	// 	path: `/post/${topic.mainPid}`,
	// 	nid: `tid:${topic.tid}:uid:${topic.uid}`,
	// 	tid: topic.tid,
	// 	from: topic.uid,
	// });
	// Notifications.push(notification, uid);
}

async function sendTopicChangeOwnerEmail(topics, uid) {
	const topic = Array.isArray(topics) ? topics[0] : topics;
	const tpl = 'topicChangeOwner'
	const params = {...topic, url: Nconf.get('url')}
	console.log('\n发送邮件通知》》\n', params)
	await sendEmail(uid, tpl, params)
}

// 发送邮件
async function sendEmail(uid, tpl, params) {
	await Emailer.send(tpl, uid, params).catch((err) => {
			console.error(err.stack);
	});
}

module.exports.TopicNotifications = TopicNotifications;
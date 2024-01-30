
'use strict';

define('admin/plugins/dingtalk-auth', ['settings', 'alerts'], (Settings, alerts) => {
	const ACP = {};

	ACP.init = function () {
		Settings.load('dingtalk-auth', $('.dingtalk-auth-settings'));

		$('#save').on('click', () => {
			Settings.save(
				'dingtalk-auth',
				$('.dingtalk-auth-settings'),
				() => {
					alerts.alert({
						type: 'success',
						alert_id: 'dingtalk-auth-saved',
						title: 'Settings Saved',
						message: 'Please reload your NodeBB to apply these settings',
						clickfn: function () {
							socket.emit('admin.reload');
						},
					});
				}
			);
		});
	};

	return ACP;
});

<div class="acp-page-container">
	<!-- IMPORT admin/partials/settings/header.tpl -->
    <div class="row">
        <div class="col-sm-10 col-xs-12">
            <div class="alert alert-info">
                <p>
                    请先在<a href="https://open-dev.dingtalk.com/" target="_blank" title="DingTalk开放中心">DingTalk开放中心</a>注册。
                </p>
            </div>
            <form class="dingtalk-auth-settings">
                <div class="form-group mb-3">
                    <label for="id">App ID</label>
                    <input type="text" name="id" title="App ID" class="form-control" placeholder="App ID">
                </div>
                <div class="form-group mb-3">
                    <label for="secret">App Secret</label>
                    <input type="text" name="secret" title="App Secret" class="form-control" placeholder="App Secret" />
                </div>
                <div class="form-group mb-3">
                    <label for="webhook">webhook</label>
                    <input type="text" name="webhook" title="App webhook" class="form-control" placeholder="App webhook" />
                </div>

                <div class="form-group mb-3">
                    <label>主题变更拥有者通知</label>
                    <select id="notificationSetting" name="notice_type" class="form-control" >
                        <option value="email">仅邮件</option>
                        <option value="notification">仅站内信</option>
                        <option value="dingtalk">仅钉钉</option>
                        <option value="both">邮件和站内信</option>
                    </select>
                </div>
                <div class="form-group mb-3">
                    <label for="callback">Your NodeBB&apos;s "Authorization callback URL"</label>
                    <input type="text" id="callback" title="Authorization callback URL" class="form-control" value="{callbackURL}" readonly />
                </div>
            </form>
        </div>
    </div>
</div>

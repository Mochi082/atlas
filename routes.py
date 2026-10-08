import binascii
import os
import re
from datetime import datetime
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from uuid import uuid4
import pyotp
from flask import abort, current_app, render_template, request, redirect, url_for, flash, session
from flask_login import current_user, login_user, login_required, logout_user
from flask_wtf.csrf import CSRFError
from sqlalchemy import or_
from sqlalchemy.exc import SQLAlchemyError
from werkzeug.security import check_password_hash
from extensions import db
from models import Comment, Activity, Information, User


ACTIVITY_IMAGE_TYPES = {
    ".jpg": lambda data: data.startswith(b"\xff\xd8\xff"),
    ".jpeg": lambda data: data.startswith(b"\xff\xd8\xff"),
    ".png": lambda data: data.startswith(b"\x89PNG\r\n\x1a\n"),
    ".gif": lambda data: data.startswith((b"GIF87a", b"GIF89a")),
    ".webp": lambda data: data.startswith(b"RIFF") and data[8:12] == b"WEBP",
}
MAX_ACTIVITY_IMAGE_SIZE = 10 * 1024 * 1024


def load_activity_image(upload):
    if upload is None or not upload.filename:
        return None

    extension = Path(upload.filename).suffix.lower()
    image_type = ACTIVITY_IMAGE_TYPES.get(extension)
    if image_type is None:
        raise ValueError("画像はJPEG、PNG、GIF、またはWebP形式で選択してください。")

    contents = upload.stream.read(MAX_ACTIVITY_IMAGE_SIZE + 1)
    if len(contents) > MAX_ACTIVITY_IMAGE_SIZE:
        raise ValueError("画像は1枚あたり10MB以下にしてください。")
    if not contents or not image_type(contents):
        raise ValueError("画像ファイルの内容を確認できません。")
    return extension, contents


def save_activity_image(extension, contents):
    upload_directory = Path(current_app.static_folder) / "uploads" / "activities"
    upload_directory.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid4().hex}{extension}"
    destination = upload_directory / filename
    destination.write_bytes(contents)
    return destination, f"uploads/activities/{filename}"

def delete_activity_images(image_paths):
    upload_directory = (Path(current_app.static_folder) / "uploads" / "activities").resolve()
    for image_path in image_paths:
        if not image_path:
            continue
        file_path = (Path(current_app.static_folder) / image_path).resolve()
        if file_path.parent != upload_directory:
            continue
        try:
            file_path.unlink(missing_ok=True)
        except OSError:
            current_app.logger.exception("Failed to delete activity image %s", image_path)

# VOiCE の埋め込みタグの共通部分
#   <iframe src="https://www.shain-voice.com/corporate/408983039119265/comments/<カテゴリ>/<口コミ番号>?embed=1&attr=1&share=0" ...></iframe>
VOICE_EMBED_HOST = "www.shain-voice.com"
VOICE_CORPORATE_ID = "408983039119265"
VOICE_PATH_PATTERN = re.compile(rf"^/corporate/{VOICE_CORPORATE_ID}/comments/[a-z0-9-]+/\d+$")
VOICE_FLAG_PARAMS = ("attr", "share")
VOICE_IFRAME_ATTRS = {"src", "style", "title", "loading"}


class IframeTagParser(HTMLParser):
    # 貼り付けられた文字列の中身（タグ・文字列）を記録する
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.start_tags = []
        self.end_tags = []
        self.others = []

    def handle_starttag(self, tag, attrs):
        self.start_tags.append((tag, dict(attrs)))

    def handle_startendtag(self, tag, attrs):
        self.others.append(tag)

    def handle_endtag(self, tag):
        self.end_tags.append(tag)

    def handle_data(self, data):
        if data.strip():
            self.others.append(data)

    def handle_comment(self, data):
        self.others.append(data)

    def handle_decl(self, decl):
        self.others.append(decl)

    def handle_pi(self, data):
        self.others.append(data)


def parse_voice_embed(value):
    value = value.strip()
    if not value:
        return None, "VOiCEの埋め込みタグを貼り付けてください。"

    parser = IframeTagParser()
    parser.feed(value)
    parser.close()
    if (len(parser.start_tags) != 1 or parser.start_tags[0][0] != "iframe"
            or parser.end_tags != ["iframe"] or parser.others):
        return None, "<iframe ...></iframe> のタグを1つだけ貼り付けてください。前後の文字やほかのタグは含めないでください。"

    attrs = parser.start_tags[0][1]
    if set(attrs) - VOICE_IFRAME_ATTRS:
        return None, "VOiCEの埋め込みタグにない属性が含まれています。VOiCEの管理画面からコピーしたタグをそのまま貼り付けてください。"
    src = (attrs.get("src") or "").strip()
    if not src:
        return None, "iframe タグに src がありません。VOiCEの埋め込みタグをそのまま貼り付けてください。"

    parts = urlsplit(src)
    if (parts.scheme != "https" or parts.netloc != VOICE_EMBED_HOST or parts.fragment
            or not VOICE_PATH_PATTERN.match(parts.path)):
        return None, "当社のVOiCE口コミの埋め込みタグではありません。VOiCEの管理画面からコピーしたタグを貼り付けてください。"

    try:
        params = dict(parse_qsl(parts.query, keep_blank_values=True, strict_parsing=True))
    except ValueError:
        params = None
    if (params is None or params.get("embed") != "1"
            or set(params) - {"embed", *VOICE_FLAG_PARAMS}
            or any(params.get(name, "0") not in ("0", "1") for name in VOICE_FLAG_PARAMS)):
        return None, "埋め込みURLのパラメータが正しくありません（embed=1、attr・share は 0 か 1）。"

    # attr は常に 1、share（共有ボタンの表示）は常に 0 にして保存する
    query = urlencode({"embed": "1", "attr": "1", "share": "0"})
    return urlunsplit(("https", VOICE_EMBED_HOST, parts.path, query, "")), None


def voice_comment_path(url):
    return urlsplit(url).path

def login_expired_before():
    return datetime.now() - current_app.permanent_session_lifetime


def has_active_login(user):
    return user.status == 1 and user.last_seen is not None and user.last_seen >= login_expired_before()


def register_routes(app):

    @app.before_request
    def check_login_session():
        # 別の端末でログインし直された、または期限が切れたセッションはログアウトさせる
        if request.endpoint == 'static' or not current_user.is_authenticated:
            return None
        if current_user.login_token != session.get('login_token') or not has_active_login(current_user):
            logout_user()
            session.clear()
            flash('ログインの有効期限が切れました。もう一度ログインしてください。', 'danger')
            return redirect(url_for('login'))
        current_user.last_seen = datetime.now()
        db.session.commit()
        return None

    @app.errorhandler(CSRFError)
    def csrf_error(error):
        post_only_retry = {'delete_info': 'info_edit', 'delete_activity': 'activity_edit', 'delete_comment': 'comment_edit','logout': 'management'}
        retry_endpoint = post_only_retry.get(request.endpoint)
        retry_url = url_for(retry_endpoint) if retry_endpoint else request.path
        with open("log.txt", "a", encoding="utf-8") as f:
            f.write(f"{datetime.now()}: CSRF検証エラー {request.method} {request.path} ({error.description})\n")
        return render_template('csrf_error.html', retry_url=retry_url), 400

    @app.route('/')
    def index():
        informations = db.session.scalars(
            db.select(Information).where(Information.published == True).order_by(Information.date.desc()).limit(4)
        ).all()  
        return render_template('index.html', informations=informations)

    @app.route('/news')
    def news():
        informations = db.session.scalars(
            db.select(Information).where(Information.published == True).order_by(Information.date.desc())
        ).all()
        return render_template('news.html', informations=informations, news_count=len(informations))


    @app.route('/news_contents/<int:information_id>')
    def news_contents(information_id):
        information = db.session.get(Information, information_id)
        if information is None or not information.published:
            abort(404)
        return render_template('news_contents.html', information=information)

    @app.route('/business')
    def business():
        return render_template('business.html')

    @app.route('/company')
    def company():
        activities = db.session.scalars(
            db.select(Activity).where(Activity.published == True).order_by(Activity.date.desc())
        ).all()
        return render_template('company.html', activities=activities)

    @app.route('/company-logo')
    def company_logo():
        return render_template('company-logo.html')

    @app.route('/company-message')
    def company_message():
        return render_template('company-message.html')

    @app.route('/company-principles')
    def company_principles():
        return render_template('company-principles.html')

    @app.route('/company-profile')
    def company_profile():
        return render_template('company-profile.html')

    @app.route('/activity_contents/<int:activity_id>')
    def activity_contents(activity_id):
        activity = db.session.get(Activity, activity_id)
        if activity is None or not activity.published:
            abort(404)
        return render_template('activity_contents.html', activity=activity)

    @app.route('/contact')
    def contact():
        return render_template('contact.html')

    @app.route('/contact-confirm')
    def contact_confirm():
        return render_template('contact-confirm.html')

    @app.route('/contact-complete')
    def contact_complete():
        return render_template('contact-complete.html')

    @app.route('/partner')
    def partner():
        return render_template('partner.html')

    @app.route('/recruit')
    def recruit():
        comments = db.session.scalars(db.select(Comment).order_by(Comment.date.desc())).all()
        return render_template('recruit.html',comments=comments)

    @app.route('/policy_disclaimer')
    def policy_disclaimer():
        return render_template('policy-disclaimer.html')

    @app.route('/policy_privacy')
    def policy_privacy():
        return render_template('policy-privacy.html')

    @app.route('/policy_protection')
    def policy_protection():
        return render_template('policy-protection.html')

    @app.route('/policy_security')
    def policy_security():
        return render_template('policy-security.html')

    @app.route('/policy_terms')
    def policy_terms():
        return render_template('policy-terms.html')

    @app.route('/smes')
    def smes():
        return render_template('smes.html')

    @app.route('/policy_harassment')
    def policy_harassment():
        return render_template('policy-harassment.html')



    #以下管理画面
    @app.route('/login', methods=['GET', 'POST'])
    def login():
        if current_user.is_authenticated:
            return redirect(url_for('management'))
        if request.method == 'POST':
            password = request.form.get('password', '')
            user = db.session.get(User, 1)
            if user and check_password_hash(user.pw_hash, password):
                if has_active_login(user):
                    flash('別の端末でログイン中のため、ログインできません。', 'danger')
                    return redirect(url_for('login'))
                session['pending_auth_user_id'] = user.id
                return redirect(url_for('authenticator'))
            else:
                flash('パスワードが正しくありません。', 'danger')
        return render_template('login.html')

    @app.route('/authenticator', methods=['GET', 'POST'])
    def authenticator():
        pending_user_id = session.get('pending_auth_user_id')
        if pending_user_id is None:
            flash('先にパスワードでログインしてください。', 'danger')
            return redirect(url_for('login'))

        if request.method == 'POST':
            totp_secret = os.getenv('ADMIN_TOTP_SECRET', '')
            code = request.form.get('totp_code', '').replace(' ', '')
            try:
                code_is_valid = pyotp.TOTP(totp_secret).verify(code)
            except (binascii.Error, ValueError):
                code_is_valid = False

            if code_is_valid:
                session.pop('pending_auth_user_id', None)
                token = uuid4().hex
                # 「ログイン中でなければログイン中にする」を1つのUPDATEで行い、同時ログインを防ぐ
                result = db.session.execute(
                    db.update(User)
                    .where(User.id == pending_user_id)
                    .where(or_(User.status != 1, User.last_seen.is_(None), User.last_seen < login_expired_before()))
                    .values(status=1, login_token=token, last_seen=datetime.now())
                )
                db.session.commit()
                if result.rowcount == 0:
                    flash('別の端末でログイン中のため、ログインできません。', 'danger')
                    return redirect(url_for('login'))
                user = db.session.get(User, pending_user_id)
                session['login_token'] = token
                login_user(user)
                flash('ログインに成功しました。', 'success')
                with open("log.txt", "a", encoding="utf-8") as f:
                    f.write(f"{datetime.now()}: ログイン\n")
                return redirect(url_for('management'))

            flash('Authenticatorコードが正しくありません。', 'danger')

        return render_template('authenticator.html')

    @app.route('/management')
    @login_required
    def management():
        informations = db.session.scalars(
            db.select(Information).order_by(Information.date.desc())
        ).all()
        activities = db.session.scalars(
            db.select(Activity).order_by(Activity.date.desc())
        ).all()
        comments = db.session.scalars(
            db.select(Comment).order_by(Comment.date.desc())
        ).all()
        return render_template('management.html', informations=informations, activities=activities, comments=comments)

    @app.route('/newinfo', methods=['GET', 'POST'])
    @login_required
    def newinfo():
        if request.method == 'GET':  
            return render_template('newinfo.html')
        title = request.form.get('title', '').strip()
        text = request.form.get('content', '').strip()
        if not title or not text:
            flash('タイトルと本文を入力してください。', 'danger')
            return redirect(url_for('newinfo'))

        information = Information(
            date=datetime.now(),
            title=title,
            text=text,
            published=True,
        )
        db.session.add(information)
        db.session.commit()
        flash('お知らせを保存しました。', 'success')
        with open("log.txt", "a", encoding="utf-8") as f:
            f.write(f"{datetime.now()}: お知らせ追加\n")
        return redirect(url_for('management'))

    @app.route('/info_edit', methods=['GET', 'POST'])
    @login_required
    def info_edit():
        if request.method == 'GET':
            informations = db.session.scalars(
                db.select(Information).order_by(Information.date.desc())
            ).all()
            return render_template('info_edit.html', informations=informations)

        information_ids = request.form.getlist('information_id')
        try:
            information_ids = [int(information_id) for information_id in information_ids]
        except ValueError:
            abort(400)
        if not information_ids or len(set(information_ids)) != len(information_ids):
            abort(400)

        updates = []
        for information_id in information_ids:
            information = db.session.get(Information, information_id)
            if information is None:
                abort(404)

            title = request.form.get(f'title_{information_id}', '').strip()
            text = request.form.get(f'content_{information_id}', '').strip()
            if not title or not text:
                flash('タイトルと本文を入力してください。変更は保存されていません。', 'danger')
                return redirect(url_for('info_edit'))
            published = request.form.get(f'published_{information_id}') == '1'
            updates.append((information, title, text, published))

        for information, title, text, published in updates:
            information.title = title
            information.text = text
            information.published = published
        db.session.commit()
        with open("log.txt", "a", encoding="utf-8") as f:
            f.write(f"{datetime.now()}: お知らせ編集\n")
        return redirect(url_for('management'))

    @app.route('/delete_info/<int:information_id>', methods=['POST'])
    @login_required
    def delete_info(information_id):
        information = db.session.get(Information, information_id)
        if information is None:
            abort(404)

        db.session.delete(information)
        db.session.commit()
        with open("log.txt", "a", encoding="utf-8") as f:
            f.write(f"{datetime.now()}: お知らせ削除\n")
        flash('お知らせを削除しました。', 'success')
        return redirect(url_for('info_edit'))

    @app.route('/new_activity', methods=['GET', 'POST'])
    @login_required
    def new_activity():
        if request.method == 'GET':
            return render_template('new_activity.html')

        title = request.form.get("title", "").strip()
        texts = [request.form.get(f"text{number}", "").strip() for number in range(1, 5)]
        uploads = [request.files.get(f"image{number}") for number in range(1, 5)]

        if not title or not texts[0]:
            flash("タイトルと本文を入力してください。", "danger")
            return redirect(url_for("new_activity"))

        image_data = []
        for index, upload in enumerate(uploads):
            try:
                image = load_activity_image(upload)
            except ValueError as error:
                flash(str(error), "danger")
                return redirect(url_for("new_activity"))
            if image is not None:
                image_data.append((index, *image))

        saved_paths = []
        relative_paths = [None] * 4
        try:
            for index, extension, contents in image_data:
                destination, relative_paths[index] = save_activity_image(extension, contents)
                saved_paths.append(destination)
        except OSError:
            for saved_path in saved_paths:
                saved_path.unlink(missing_ok=True)
            current_app.logger.exception("Failed to save activity image uploads")
            abort(500)

        activity = Activity(
            date=datetime.now(),
            title=title,
            text1=texts[0],
            text2=texts[1],
            text3=texts[2],
            text4=texts[3],
            image_path_1=relative_paths[0],
            image_path_2=relative_paths[1],
            image_path_3=relative_paths[2],
            image_path_4=relative_paths[3],
            published=True,
        )
        db.session.add(activity)
        try:
            db.session.commit()
        except SQLAlchemyError:
            db.session.rollback()
            for saved_path in saved_paths:
                saved_path.unlink(missing_ok=True)
            current_app.logger.exception("Failed to create activity")
            flash("活動記事を保存できませんでした。もう一度お試しください。", "danger")
            return render_template("new_activity.html"), 500

        flash("活動記事を作成しました。", "success")
        with open("log.txt", "a", encoding="utf-8") as f:
            f.write(f"{datetime.now()}: 活動記事追加\n")
        return redirect(url_for('management'))
    
    @app.route('/activity_edit', methods=['GET', 'POST'])
    @login_required
    def activity_edit():
        if request.method == 'GET':
            activities = db.session.scalars(
                db.select(Activity).order_by(Activity.date.desc())
            ).all()
            return render_template('activity_edit.html', activities=activities)

        activity_ids = request.form.getlist('activity_id')
        try:
            activity_ids = [int(activity_id) for activity_id in activity_ids]
        except ValueError:
            abort(400)
        if not activity_ids or len(set(activity_ids)) != len(activity_ids):
            abort(400)

        updates = []
        new_images = []  #保存は全件の検証後に行う
        for activity_id in activity_ids:
            activity = db.session.get(Activity, activity_id)
            if activity is None:
                abort(404)

            title = request.form.get(f'title_{activity_id}', '').strip()
            texts = [request.form.get(f'text{number}_{activity_id}', '').strip() for number in range(1, 5)]
            if not title or not texts[0]:
                flash('タイトルと本文を入力してください。変更は保存されていません。', 'danger')
                return redirect(url_for('activity_edit'))
            published = request.form.get(f'published_{activity_id}') == '1'

            image_paths = []
            for number in range(1, 5):
                image_path = getattr(activity, f'image_path_{number}')
                if request.form.get(f'delete_image_{number}_{activity_id}') == '1':
                    image_path = None
                else:
                    try:
                        image = load_activity_image(request.files.get(f'image_{number}_{activity_id}'))
                    except ValueError as error:
                        flash(f'{error}変更は保存されていません。', 'danger')
                        return redirect(url_for('activity_edit'))
                    if image is not None:
                        new_images.append((image_paths, number - 1, *image))
                image_paths.append(image_path)

            updates.append((activity, title, texts, published, image_paths))

        saved_paths = []
        try:
            for image_paths, index, extension, contents in new_images:
                destination, image_paths[index] = save_activity_image(extension, contents)
                saved_paths.append(destination)
        except OSError:
            for saved_path in saved_paths:
                saved_path.unlink(missing_ok=True)
            current_app.logger.exception("Failed to save activity image uploads")
            abort(500)

        old_image_paths = []
        for activity, title, texts, published, image_paths in updates:
            activity.title = title
            activity.published = published
            for number in range(1, 5):
                setattr(activity, f'text{number}', texts[number - 1])
                old_image_path = getattr(activity, f'image_path_{number}')
                if old_image_path != image_paths[number - 1]:
                    old_image_paths.append(old_image_path)
                setattr(activity, f'image_path_{number}', image_paths[number - 1])
        try:
            db.session.commit()
        except SQLAlchemyError:
            db.session.rollback()
            for saved_path in saved_paths:
                saved_path.unlink(missing_ok=True)
            current_app.logger.exception("Failed to update activities")
            flash("活動記事を保存できませんでした。もう一度お試しください。", "danger")
            return redirect(url_for('activity_edit'))
        delete_activity_images(old_image_paths)
        with open("log.txt", "a", encoding="utf-8") as f:
            f.write(f"{datetime.now()}: 活動記事編集\n")
        return redirect(url_for('management'))

    @app.route('/delete_activity/<int:activity_id>', methods=['POST'])
    @login_required
    def delete_activity(activity_id):
        activity = db.session.get(Activity, activity_id)
        if activity is None:
            abort(404)

        image_paths = [getattr(activity, f'image_path_{number}') for number in range(1, 5)]
        db.session.delete(activity)
        db.session.commit()
        delete_activity_images(image_paths)
        with open("log.txt", "a", encoding="utf-8") as f:
            f.write(f"{datetime.now()}: 活動記事削除\n")
        return redirect(url_for('activity_edit'))
    
    @app.route('/new_comment', methods=['GET', 'POST'])
    @login_required
    def new_comment():
        if request.method == 'GET':
            return render_template('new_comment.html')

        url, error = parse_voice_embed(request.form.get("embed", ""))
        if error:
            flash(error, "danger")
            return redirect(url_for("new_comment"))

        # 5. 同じ口コミが登録済みでないか
        registered = db.session.scalars(db.select(Comment.url)).all()
        if voice_comment_path(url) in {voice_comment_path(registered_url) for registered_url in registered}:
            flash("この口コミはすでに登録されています。", "danger")
            return redirect(url_for("new_comment"))

        comment = Comment(url=url, date=datetime.now())
        db.session.add(comment)
        db.session.commit()
        with open("log.txt", "a", encoding="utf-8") as f:
            f.write(f"{datetime.now()}: 社員の声追加\n")
        return redirect(url_for('management'))

    @app.route('/comment_edit')
    @login_required
    def comment_edit():
        comments = db.session.scalars(
            db.select(Comment).order_by(Comment.date.desc())
        ).all()
        return render_template('comment_edit.html', comments=comments)

    @app.route('/delete_comment/<int:comment_id>', methods=['POST'])
    @login_required
    def delete_comment(comment_id):
        comment = db.session.get(Comment, comment_id)
        if comment is None:
            abort(404)

        db.session.delete(comment)
        db.session.commit()
        with open("log.txt", "a", encoding="utf-8") as f:
            f.write(f"{datetime.now()}: 社員の声削除\n")
        flash('社員の声を削除しました。', 'success')
        return redirect(url_for('comment_edit'))

    

    @app.route('/logout', methods=['POST'])
    @login_required
    def logout():
        logout_user()
        user = db.session.get(User, 1)
        user.status = 0
        user.login_token = None
        user.last_seen = None
        db.session.commit()
        session.clear()
        with open("log.txt", "a", encoding="utf-8") as f:
            f.write(f"{datetime.now()}: ログアウト\n")
        return redirect(url_for('login'))
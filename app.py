from flask import Flask
from flask_wtf.csrf import CSRFProtect
from dotenv import load_dotenv
import os
from extensions import db, login_manager
from models import User
from routes import register_routes
from datetime import timedelta

load_dotenv()

csrf = CSRFProtect()


def create_app():
    app = Flask(__name__)
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///atlas.db'
    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY')
    app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(hours=5)
    # CSRF トークンの有効期限をセッションと同じ5時間にする（初期値は1時間）
    app.config['WTF_CSRF_TIME_LIMIT'] = 5 * 60 * 60

    # SQLAlchemyとFlaskの関連付け
    db.init_app(app)

    # CSRF対策（POST などのリクエストでトークンを検証する）
    csrf.init_app(app)

    # LoginManagerとFlaskの関連付け
    login_manager.init_app(app)
    login_manager.login_view = "login"

    # ログインユーザーを取得
    @login_manager.user_loader
    def load_user(user_id):
        return db.session.get(User, int(user_id))

    # ルーティングの登録
    register_routes(app)

    return app


app = create_app()


if __name__ == '__main__':
    app.run('0.0.0.0', 8080, False)
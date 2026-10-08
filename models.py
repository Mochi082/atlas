from datetime import datetime
from flask_login import UserMixin
from sqlalchemy import Boolean, DateTime, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column
from extensions import db

class User(UserMixin, db.Model):
	__tablename__ = "user"

	id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
	pw_hash: Mapped[str] = mapped_column(Text, nullable=False)
	status: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
	# ログイン中のブラウザの合言葉と、最後に管理画面を操作した時刻（同時ログインの防止に使う）
	login_token: Mapped[str] = mapped_column(Text, nullable=True)
	last_seen: Mapped[datetime] = mapped_column(DateTime, nullable=True)


class Information(db.Model):
	__tablename__ = "infomation"

	id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
	date: Mapped[datetime] = mapped_column(DateTime, nullable=False)
	title: Mapped[str] = mapped_column(Text, nullable=False)
	text: Mapped[str] = mapped_column(Text, nullable=False)
	published: Mapped[bool] = mapped_column(Boolean, nullable=False)


class Activity(db.Model):
	__tablename__ = "activity"

	id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
	date: Mapped[datetime] = mapped_column(DateTime, nullable=False)
	title: Mapped[str] = mapped_column(Text, nullable=False)
	text1: Mapped[str] = mapped_column(Text, nullable=False)
	text2: Mapped[str] = mapped_column(Text, nullable=True)
	text3: Mapped[str] = mapped_column(Text, nullable=True)
	text4: Mapped[str] = mapped_column(Text, nullable=True)
	image_path_1: Mapped[str] = mapped_column(Text, nullable=True)
	image_path_2: Mapped[str] = mapped_column(Text, nullable=True)
	image_path_3: Mapped[str] = mapped_column(Text, nullable=True)
	image_path_4: Mapped[str] = mapped_column(Text, nullable=True)
	published: Mapped[bool] = mapped_column(Boolean, nullable=False)

class Comment(db.Model):
	__tablename__ = "comment"
	id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
	url: Mapped[str] = mapped_column(Text, nullable=False) #srcのみ
	date: Mapped[datetime] = mapped_column(DateTime, nullable=False)

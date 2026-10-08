/* One detail page for all articles; use text nodes for editorial content. */
(() => {
  const title = document.getElementById('news-detail-title');
  const article = document.getElementById('news-detail-article');
  const date = document.getElementById('news-detail-date');
  if (!title || !article || !date) return;
  const id = new URLSearchParams(window.location.search).get('id');
  const item = Array.isArray(window.atlasNews) && window.atlasNews.find(item => item.id === id);
  article.querySelector('#news-detail-status')?.remove();
  if (!item) {
    title.textContent = '記事が見つかりません';
    const message = document.createElement('p');
    message.textContent = 'お知らせ一覧から記事をお選びください。';
    article.append(message);
    return;
  }
  title.textContent = item.title;
  document.title = item.title + ' | ATLAS COMPUTER';
  date.dateTime = item.date;
  date.textContent = item.date.replaceAll('-', '.');
  item.paragraphs.forEach(text => {
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    article.append(paragraph);
  });

})();

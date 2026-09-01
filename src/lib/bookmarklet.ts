// Fans' の管理画面上で実行するワンクリック取込ブックマークレットを生成する。
// 動作: 開いているページから CSV エクスポートのリンクを探して取得し、
// 本システムの /api/roster/import に送信する。
// 運営者本人がログイン済みのブラウザで手動クリックする前提(自動巡回はしない)。
// Fans' の画面構成に依存するため、リンクが見つからない場合は案内を表示して終了する。
// TODO(hearing:Q1): 実際の Fans' 管理画面でリンク検出条件を確定させる

export function buildBookmarkletSource(apiUrl: string, token: string): string {
  return (
    `(async()=>{try{` +
    `var A=${JSON.stringify(apiUrl)},T=${JSON.stringify(token)};` +
    `var es=[].slice.call(document.querySelectorAll('a[href]'));` +
    `var l=es.map(function(e){return e.href}).find(function(h){return /\\.csv(\\?|$)|format=csv|\\/csv\\b/i.test(h)});` +
    `if(!l){var c2=es.filter(function(e){return /csv|エクスポート|ダウンロード/i.test(e.textContent||'')})[0];if(c2)l=c2.href;}` +
    `var c=null;` +
    `if(l){var r=await fetch(l,{credentials:'include'});if(r.ok)c=await r.text();}` +
    `if(!c||c.indexOf('@')<0){alert('会員CSVを取得できませんでした。Fans` +
    `\\u2019 の会員一覧(CSVエクスポート)ページを開いた状態で実行してください。');return;}` +
    `var res=await fetch(A,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({token:T,csv:c})});` +
    `var j=await res.json();` +
    `alert(j.ok?'会員名簿を更新しました('+j.count+'件)':'取込に失敗しました: '+(j.error||res.status));` +
    `}catch(e){alert('取込エラー: '+e)}})()`
  );
}

export function buildBookmarkletHref(apiUrl: string, token: string): string {
  return "javascript:" + encodeURIComponent(buildBookmarkletSource(apiUrl, token));
}

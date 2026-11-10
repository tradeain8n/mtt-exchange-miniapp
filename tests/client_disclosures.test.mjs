import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
const ui=readFileSync(new URL('../docs/assets/main.js',import.meta.url),'utf8');

test('Binance funding must use a personal BEP-20 wallet, never the shared exchange wallet',()=>{
 assert.match(html,/USDT на Binance\?/);
 assert.match(html,/t\.me\/babymttbot\?start=binance/);
 assert.match(html,/Не отправляйте прямо с биржи на адрес обменника/);
 assert.match(html,/Прямой вывод с Binance и других бирж на обменник НЕ поддерживается/);
 assert.match(html,/BNB для комиссии/);
});

test('client must see the service share and final floating settlement warning',()=>{
 assert.match(html,/клиент получает 90%/i);
 assert.match(html,/10% удерживает сервис/);
 assert.match(html,/комиссию сервиса 10%/);
 assert.match(ui,/клиенту 90% фактически купленных MTT, сервису 10%/);
 assert.match(ui,/Итог зависит от цены пула/);
});

test('closed financial acceptance UI is still present, independent of quotes',()=>{
 assert.match(html,/id="service-closed"/);
 assert.match(html,/id="payment-panel" class="hidden"/);
});

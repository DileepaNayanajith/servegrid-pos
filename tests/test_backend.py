"""Run: python -m unittest discover -s tests -v"""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from urllib.request import build_opener, HTTPCookieProcessor, Request
from urllib.error import HTTPError, URLError
from http.cookiejar import CookieJar


class ServerEndToEnd(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.port = 18978
        root = Path(__file__).resolve().parents[1]
        env = dict(os.environ,FASTPOS_PORT=str(cls.port),FASTPOS_DB_PATH=str(Path(cls.temp.name)/'test.sqlite'),FASTPOS_NO_BROWSER='1')
        cls.proc=subprocess.Popen([sys.executable,str(root/'server.py')],cwd=root,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
        cls.base=f'http://127.0.0.1:{cls.port}'
        cls.opener=build_opener(HTTPCookieProcessor(CookieJar()))
        for _ in range(70):
            try:
                cls.request('/api/state');return
            except (URLError, ConnectionError):time.sleep(.1)
        raise RuntimeError('Server failed to start')

    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate()
        try:cls.proc.wait(timeout=5)
        except subprocess.TimeoutExpired:cls.proc.kill()
        cls.temp.cleanup()

    @classmethod
    def request(cls,path,post=None):
        headers={'Content-Type':'application/json'} if post is not None else {}
        req=Request(cls.base+path,data=json.dumps(post).encode() if post is not None else None,headers=headers)
        with cls.opener.open(req,timeout=10) as response:
            return json.loads(response.read())

    def test_complete_workflow(self):
        state=self.request('/api/state')
        self.assertEqual(len(state['items']),16)
        self.assertTrue(state['demo_mode'])
        self.assertFalse(state['admin_configured'])
        self.assertEqual(state['items'][0]['price'],550)
        with self.assertRaises(HTTPError) as ctx:
            self.request('/api/admin/mode',{'go_live':True,'prices_verified':True})
        self.assertEqual(ctx.exception.code,403)
        self.request('/api/admin/setup',{'pin':'527483'})
        state=self.request('/api/state')
        self.assertTrue(state['admin_logged_in'])
        self.assertTrue(state['admin_configured'])
        menu=state['items']
        menu[0]['price']=600
        self.request('/api/admin/menu',{'items':menu})
        self.assertEqual(self.request('/api/state')['items'][0]['price'],600)
        request={
            'key':'test-order-12345678', 'service':'Takeaway','table_no':'', 'payment':'Cash',
            'cash_received':2000, 'items':[{'code':'101','qty':2},{'code':'110','qty':15}]
        }
        res=self.request('/api/orders',request)
        self.assertFalse(res['duplicate'])
        self.assertTrue(res['order']['is_demo'])
        self.assertEqual(res['order']['total'],600*2+15*15)
        self.assertEqual(res['order']['change_due'],2000-(600*2+15*15))
        self.assertEqual(len(res['order']['lines']),2)
        res2=self.request('/api/orders',request)
        self.assertTrue(res2['duplicate'])
        self.assertEqual(res2['order']['id'],res['order']['id'])
        self.request('/api/admin/mode',{'go_live':True,'prices_verified':True})
        self.assertFalse(self.request('/api/state')['demo_mode'])
        q=self.request('/api/orders',{'key':'test-order-live-2345678','service':'Dine-in','table_no':'7', 'payment':'Card','cash_received':0,'items':[{'code':'202','qty':3}]})
        self.assertFalse(q['order']['is_demo'])
        self.assertEqual(q['order']['total'],450)
        self.assertEqual(self.request('/api/state')['sales']['total'],450)
        self.request('/api/admin/void',{'order_id':q['order']['id']})
        self.assertEqual(self.request('/api/state')['sales']['total'],0)
        self.request('/api/admin/logout',{})
        self.assertFalse(self.request('/api/state')['admin_logged_in'])
        with self.assertRaises(HTTPError) as ctx:
            self.request('/api/admin/menu',{'items':menu})
        self.assertEqual(ctx.exception.code,403)

if __name__=='__main__':unittest.main()

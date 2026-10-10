"""Synthetic input on an explicitly supplied private X11 display only."""
import ctypes
import re
import subprocess
import time
class Input:
    def __init__(self,display,window):
        self.x=ctypes.CDLL('libX11.so.6');self.test=ctypes.CDLL('libXtst.so.6')
        self.x.XOpenDisplay.argtypes=[ctypes.c_char_p];self.x.XOpenDisplay.restype=ctypes.c_void_p
        self.d=self.x.XOpenDisplay(display.encode());assert self.d
        self.x.XFlush.argtypes=self.x.XCloseDisplay.argtypes=[ctypes.c_void_p]
        self.x.XStringToKeysym.argtypes=[ctypes.c_char_p];self.x.XStringToKeysym.restype=ctypes.c_ulong
        self.x.XKeysymToKeycode.argtypes=[ctypes.c_void_p,ctypes.c_ulong];self.x.XKeysymToKeycode.restype=ctypes.c_uint
        self.test.XTestFakeMotionEvent.argtypes=[ctypes.c_void_p,ctypes.c_int,ctypes.c_int,ctypes.c_int,ctypes.c_ulong]
        self.test.XTestFakeButtonEvent.argtypes=[ctypes.c_void_p,ctypes.c_uint,ctypes.c_int,ctypes.c_ulong]
        self.test.XTestFakeKeyEvent.argtypes=[ctypes.c_void_p,ctypes.c_uint,ctypes.c_int,ctypes.c_ulong]
        attrs=subprocess.check_output(['xwininfo','-display',display,'-id',window],text=True)
        self.left=int(re.search(r'Absolute upper-left X:\s+(-?\d+)',attrs)[1]);self.top=int(re.search(r'Absolute upper-left Y:\s+(-?\d+)',attrs)[1])
    def move(self,x,y):
        self.test.XTestFakeMotionEvent(self.d,-1,self.left+x,self.top+y,0);self.x.XFlush(self.d);time.sleep(.15)
    def click(self,x,y):
        self.test.XTestFakeMotionEvent(self.d,-1,self.left+x,self.top+y,0)
        self.test.XTestFakeButtonEvent(self.d,1,1,0);self.test.XTestFakeButtonEvent(self.d,1,0,0);self.x.XFlush(self.d);time.sleep(.7)
    def scroll(self,steps=5):
        for _ in range(steps):
            self.test.XTestFakeButtonEvent(self.d,5,1,0);self.test.XTestFakeButtonEvent(self.d,5,0,0)
        self.x.XFlush(self.d);time.sleep(.7)
    def key(self,name,mod=None):
        code=self.x.XKeysymToKeycode(self.d,self.x.XStringToKeysym(name.encode()))
        modifier=self.x.XKeysymToKeycode(self.d,self.x.XStringToKeysym(mod.encode())) if mod else None
        if modifier:self.test.XTestFakeKeyEvent(self.d,modifier,1,0)
        self.test.XTestFakeKeyEvent(self.d,code,1,0);self.test.XTestFakeKeyEvent(self.d,code,0,0)
        if modifier:self.test.XTestFakeKeyEvent(self.d,modifier,0,0)
        self.x.XFlush(self.d);time.sleep(.02)
    def type(self,text):
        for char in text:
            if char==' ':self.key('space')
            elif char=='\n':self.key('Return')
            elif char.isupper():self.key(char.lower(),'Shift_L')
            else:self.key(char)
        time.sleep(.7)
    def close(self):self.x.XCloseDisplay(self.d)

    def minimize(self,window):
        self.x.XIconifyWindow.argtypes=[ctypes.c_void_p,ctypes.c_ulong,ctypes.c_int]
        assert self.x.XIconifyWindow(self.d,int(window,16),0)
        self.x.XFlush(self.d);time.sleep(1)
    def restore(self,window):
        self.x.XMapRaised.argtypes=[ctypes.c_void_p,ctypes.c_ulong]
        self.x.XMapRaised(self.d,int(window,16));self.x.XFlush(self.d);time.sleep(1)

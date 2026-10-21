from __future__ import annotations
import struct
from pathlib import Path
from thrift.transport.TTransport import TMemoryBuffer
from thrift.protocol.TCompactProtocol import TCompactProtocol
from thrift.Thrift import TType

TYPE_NAMES={0:'BOOLEAN',1:'INT32',2:'INT64',3:'INT96',4:'FLOAT',5:'DOUBLE',6:'BYTE_ARRAY',7:'FIXED_LEN_BYTE_ARRAY'}
REP_NAMES={0:'REQUIRED',1:'OPTIONAL',2:'REPEATED'}
CONVERTED_NAMES={0:'UTF8',1:'MAP',2:'MAP_KEY_VALUE',3:'LIST',4:'ENUM',5:'DECIMAL',6:'DATE',7:'TIME_MILLIS',8:'TIME_MICROS',9:'TIMESTAMP_MILLIS',10:'TIMESTAMP_MICROS',11:'UINT_8',12:'UINT_16',13:'UINT_32',14:'UINT_64',15:'INT_8',16:'INT_16',17:'INT_32',18:'INT_64',19:'JSON',20:'BSON',21:'INTERVAL'}

def skip_value(proto, ttype):
    if ttype == TType.BOOL: proto.readBool()
    elif ttype == TType.BYTE: proto.readByte()
    elif ttype == TType.I16: proto.readI16()
    elif ttype == TType.I32: proto.readI32()
    elif ttype == TType.I64: proto.readI64()
    elif ttype == TType.DOUBLE: proto.readDouble()
    elif ttype == TType.STRING: proto.readBinary()
    elif ttype == TType.STRUCT:
        proto.readStructBegin()
        while True:
            _, ft, _ = proto.readFieldBegin()
            if ft == TType.STOP: break
            skip_value(proto, ft)
            proto.readFieldEnd()
        proto.readStructEnd()
    elif ttype == TType.MAP:
        kt, vt, size = proto.readMapBegin()
        for _ in range(size):
            skip_value(proto, kt); skip_value(proto, vt)
        proto.readMapEnd()
    elif ttype == TType.SET:
        et, size = proto.readSetBegin()
        for _ in range(size): skip_value(proto, et)
        proto.readSetEnd()
    elif ttype == TType.LIST:
        et, size = proto.readListBegin()
        for _ in range(size): skip_value(proto, et)
        proto.readListEnd()
    else:
        raise ValueError(f"Unsupported thrift type {ttype}")

def read_schema_element(proto):
    out={}
    proto.readStructBegin()
    while True:
        name,ftype,fid=proto.readFieldBegin()
        if ftype==TType.STOP: break
        if fid==1 and ftype==TType.I32: out['type']=proto.readI32()
        elif fid==2 and ftype==TType.I32: out['type_length']=proto.readI32()
        elif fid==3 and ftype==TType.I32: out['repetition_type']=proto.readI32()
        elif fid==4 and ftype==TType.STRING: out['name']=proto.readString()
        elif fid==5 and ftype==TType.I32: out['num_children']=proto.readI32()
        elif fid==6 and ftype==TType.I32: out['converted_type']=proto.readI32()
        elif fid==7 and ftype==TType.I32: out['scale']=proto.readI32()
        elif fid==8 and ftype==TType.I32: out['precision']=proto.readI32()
        elif fid==9 and ftype==TType.I32: out['field_id']=proto.readI32()
        else: skip_value(proto, ftype)
        proto.readFieldEnd()
    proto.readStructEnd()
    return out

def metadata(path):
    p=Path(path)
    with p.open('rb') as f:
        if f.read(4)!=b'PAR1': raise ValueError('not parquet')
        f.seek(-8,2); n=struct.unpack('<I',f.read(4))[0]; magic=f.read(4)
        if magic!=b'PAR1': raise ValueError('bad tail')
        f.seek(-8-n,2); data=f.read(n)
    proto=TCompactProtocol(TMemoryBuffer(data))
    out={'schema':[]}
    proto.readStructBegin()
    while True:
        _,ftype,fid=proto.readFieldBegin()
        if ftype==TType.STOP: break
        if fid==1 and ftype==TType.I32: out['version']=proto.readI32()
        elif fid==2 and ftype==TType.LIST:
            etype,size=proto.readListBegin()
            out['schema']=[read_schema_element(proto) for _ in range(size)]
            proto.readListEnd()
        elif fid==3 and ftype==TType.I64: out['num_rows']=proto.readI64()
        elif fid==6 and ftype==TType.STRING: out['created_by']=proto.readString()
        else: skip_value(proto, ftype)
        proto.readFieldEnd()
    proto.readStructEnd()
    return out

if __name__=='__main__':
 import sys, json
 for x in sys.argv[1:]:
  m=metadata(x)
  print('\n',x,'rows',m.get('num_rows'),'created',m.get('created_by'))
  for e in m['schema']:
   print(e.get('name'), TYPE_NAMES.get(e.get('type'),e.get('type')), REP_NAMES.get(e.get('repetition_type'),e.get('repetition_type')), CONVERTED_NAMES.get(e.get('converted_type'),e.get('converted_type')), 'children',e.get('num_children'))

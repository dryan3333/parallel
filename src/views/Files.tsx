import { FilesPanel } from '../components/FilesPanel';
export function Files() {
  return (<>
    <div className="page-h"><h1>文件</h1><span className="sub">合同、报价、素材、交付物、报告。上传件和外链放在一起，按客户 / 项目 / 分类找。</span></div>
    <FilesPanel full />
  </>);
}

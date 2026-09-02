import Ajv2020 from 'ajv/dist/2020.js';
import projectExportSchema from '../../schema/rehearse-project.schema.json' with { type: 'json' };

const validateProjectExport = new Ajv2020({ allErrors: true, strict: false, validateFormats: false }).compile(projectExportSchema);

export function validateProjectExportText(text) {
  const parsed = JSON.parse(text);
  if (!validateProjectExport(parsed)) {
    const detail = (validateProjectExport.errors || [])
      .slice(0, 3)
      .map((error) => `${error.instancePath || '项目文件'} ${error.message}`)
      .join('；');
    throw new Error(`这不是有效的 REHEARSE 项目文件${detail ? `：${detail}` : ''}`);
  }
  return parsed;
}

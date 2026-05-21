import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { filesApi } from '../../services/api';
import type { CourseAssignment, Material, PaginatedResponse  } from '../../types';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { FileUploader } from '../../components/FileUploader';
import {useAuthStore} from '../../store/authStore';

  const formatTeacherName = (ca: CourseAssignment) => {
    if (ca.teacherName) return ca.teacherName;
    if (ca.teacher) {
      const { lastName, firstName, middleName } = ca.teacher;
      return [lastName, firstName, middleName].filter(Boolean).join(' ');
    }
    return '';
  };
  
function CourseCard({ ca, role, t }: { ca: CourseAssignment; role?: string; t: TFunction }) {
  const [title, setTitle] = useState('');

  const [materials, setMaterials] = useState<Material[]>([]);
  const isTeacher = role === 'teacher' || role === 'department_head' || role === 'admin';
  useEffect(() => {
    api.get(`/courses/${ca.id}/materials`)
       .then(({ data }) => setMaterials(data.docs || data))
       .catch(() => {});
  }, [ca.id]);

  const handleUpload = async (file: File) => {
    if (!title.trim()) {
      alert('Будь ласка, введіть назву матеріалу перед завантаженням!');
      throw new Error('Title is missing');
    }
    await filesApi.uploadMaterial(ca.id, title, file);
    setTitle('');
    
    api.get(`/courses/${ca.id}/materials`).then(({ data }) => setMaterials(data.docs || data));
  };
  const handleDownload = async (e: React.MouseEvent, fileId: string, originalName: string) => {
    e.preventDefault();
    e.stopPropagation();
    try {

      const response = await api.get(`/files/download/${fileId}`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', originalName); 
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Помилка завантаження файлу:', error);
      alert('Не вдалося завантажити файл. Можливо, його було видалено.');
    }
  };
const handleDeleteMaterial = async (e: React.MouseEvent, fileId: string | undefined, materialId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm('Ви впевнені, що хочете видалити цей матеріал?')) return;
    
    try {
      if (fileId) {
        try {
          await api.delete(`/files/${fileId}`);
        } catch {
          console.warn('Файл вже видалено або не знайдено на сервері, продовжуємо...');
        }
      }
      await api.delete(`/courses/${ca.id}/materials/${materialId}`);
      setMaterials((prev) => prev.filter((m) => m.id !== materialId));
    } catch (error) {
      console.error('Помилка видалення матеріалу:', error);
      alert('Не вдалося видалити матеріал.');
    }
  };
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow flex flex-col">
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-medium">
          {ca.courseCode}
        </span>
        {ca.credits && (
          <span className="text-xs text-gray-400">
            {ca.credits} {t('courses.credits')}
          </span>
        )}
      </div>
      
      <Link to={`/courses/${ca.id}`} className="hover:text-blue-600 transition-colors">
        <h3 className="font-semibold text-gray-900 mb-2">{ca.courseName}</h3>
      </Link>
      
      <div className="flex-grow">
        {formatTeacherName(ca) && <p className="text-sm text-gray-500">{t('courses.teacher')}: {formatTeacherName(ca)}</p>}
        {ca.groupCode && <p className="text-sm text-gray-500">{t('courses.group')}: {ca.groupCode}</p>}
        <p className="text-xs text-gray-400 mt-2 mb-4">{ca.academicYear}, {t('courses.semester')} {ca.semester}</p>
      </div>

      {materials.length > 0 && (
        <div className="mt-2 mb-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Навчальні матеріали:</h4>
          <ul className="space-y-3">
            {materials.map((m) => {
              const file = m.files && m.files.length > 0 ? m.files[0] : null;
              const fileId = file ? (file.id || file._id) : undefined;
              const fileName = file ? file.originalName : '';

              return (
                <li key={m.id} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-lg mb-2">
                  <button 
                    onClick={() => fileId && handleDownload(fileId, fileName)}
                    className="text-sm text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-2 cursor-pointer bg-transparent border-none p-0 text-left"
                  >
                    {m.title} <span className="text-gray-500 text-xs">({fileName})</span>
                  </button>
                  
                  {isTeacher && (
                    <button
                      onClick={() => handleDeleteMaterial(fileId, m.id)}
                      className="text-xs font-medium text-red-600 bg-red-100 hover:bg-red-200 px-2.5 py-1.5 rounded transition-colors"
                      title="Видалити матеріал"
                    >
                      🗑️
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {isTeacher && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-sm font-medium text-gray-700 mb-2">
            Завантажити новий матеріал
          </p>
          <input
            type="text"
            placeholder="Назва лекції чи методички..."
            className="w-full mb-3 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <FileUploader
            allowedTypes={['.png', '.jpeg', '.jpg', '.pdf', '.doc', '.docx', '.zip']}
            onUpload={handleUpload}
          />
        </div>
      )}
    </div>
  );
}

export default function CoursesPage() {
  const { t } = useTranslation();
  
  const user = useAuthStore((state) => state.user);

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ['courses', 'my'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<CourseAssignment>>('/courses/my');
      return data.docs;
    },
  });



  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        {t('courses.title')}
      </h1>

      {courses.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center text-gray-400">
          {t('courses.notFound')}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {courses.map((ca: CourseAssignment) => (
              <CourseCard key={ca.id} ca={ca} role={user?.role} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}

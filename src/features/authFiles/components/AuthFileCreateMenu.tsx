import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import {
  IconChevronDown,
  IconFileText,
  IconKey,
  IconPlus,
} from '@/components/ui/icons';
import styles from './AuthFileCreateMenu.module.scss';

interface AuthFileCreateMenuProps {
  disabled: boolean;
  uploading: boolean;
  onUpload: () => void;
  onCreateOpenCodeGo: () => void;
}

export function AuthFileCreateMenu({
  disabled,
  uploading,
  onUpload,
  onCreateOpenCodeGo,
}: AuthFileCreateMenuProps) {
  const { t } = useTranslation();
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  const closeMenu = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        closeMenu();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [closeMenu, open]);

  const handleToggle = useCallback(() => {
    if (disabled) return;
    setOpen((current) => !current);
  }, [disabled]);

  const handleUpload = useCallback(() => {
    if (disabled || uploading) return;
    closeMenu();
    onUpload();
  }, [closeMenu, disabled, onUpload, uploading]);

  const handleCreateOpenCodeGo = useCallback(() => {
    if (disabled) return;
    closeMenu();
    onCreateOpenCodeGo();
  }, [closeMenu, disabled, onCreateOpenCodeGo]);

  return (
    <div className={styles.createMenu} ref={menuRef}>
      <Button
        size="sm"
        onClick={handleToggle}
        disabled={disabled}
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
      >
        <IconPlus size={16} />
        {t('auth_files.create_menu_button')}
        <IconChevronDown size={14} className={open ? styles.chevronOpen : ''} />
      </Button>

      {open && (
        <div id={menuId} className={styles.menu} role="menu">
          <button
            type="button"
            className={styles.menuItem}
            onClick={handleUpload}
            disabled={disabled || uploading}
            role="menuitem"
          >
            {uploading ? (
              <span className="loading-spinner" aria-hidden="true" />
            ) : (
              <IconFileText size={16} />
            )}
            <span>{t('auth_files.upload_auth_file_menu_item')}</span>
          </button>
          <button
            type="button"
            className={styles.menuItem}
            onClick={handleCreateOpenCodeGo}
            disabled={disabled}
            role="menuitem"
          >
            <IconKey size={16} />
            <span>{t('auth_files.opencode_go_credential_menu_item')}</span>
          </button>
        </div>
      )}
    </div>
  );
}

import { createPortal } from 'react-dom';
import styles from './Modal.module.css';

function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  hideOverlay = false,
  overlayClassName,
  modalClassName,
}) {
  if (!open) return null;
  return createPortal(
    <div
      className={`${styles.overlay} ${hideOverlay ? styles.overlayPlain : ''} ${overlayClassName || ''}`}
      onClick={hideOverlay ? undefined : onClose}
    >
      <div className={`${styles.modal} ${modalClassName || ''}`} onClick={(e) => e.stopPropagation()}>
        {title && (
          <header className={styles.header}>
            <h3>{title}</h3>
            <button type="button" onClick={onClose}>
              ×
            </button>
          </header>
        )}
        <div className={styles.body}>{children}</div>
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

export default Modal;

"""
Test ONNX-based text detection on manga page.
"""
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent))

from PIL import Image
import numpy as np
import cv2
from core.detector import get_detector, DeepLearningMangaDetector

def test_onnx_detection():
    """Test ONNX model detection on manga page."""
    print("=" * 60)
    print("Testing ONNX Text Detection")
    print("=" * 60)
    
    # Test 1: Test post-processing logic directly
    print("\n" + "=" * 60)
    print("Test 1: CTD Post-Processing Logic")
    print("=" * 60)
    
    try:
        detector = get_detector('ctd', confidence_threshold=0.15)
        print(f"[SUCCESS] CTD ONNX detector created: {type(detector).__name__}")
        
        # Create dummy output simulating (1, 64512, 7) tensor
        dummy_output = np.zeros((1, 100, 7), dtype=np.float32)
        for i in range(9):
            dummy_output[0, i, 4] = 0.9 - (i * 0.05)  # Decreasing confidence
            dummy_output[0, i, 0] = 100 + i * 100  # cx
            dummy_output[0, i, 1] = 200 + i * 50   # cy
            dummy_output[0, i, 2] = 80   # w
            dummy_output[0, i, 3] = 120  # h
        
        print("[INFO] Testing post-processing with 9 boxes...")
        boxes = detector._postprocess_ctd(dummy_output, (1200, 800, 3), (1024, 1024))
        print(f"[SUCCESS] Post-processing completed: {len(boxes)} boxes")
        
        for i, box in enumerate(boxes):
            print(f"  Box {i}: ({box.x0}, {box.y0}, {box.x1}, {box.y1})")
        
        if len(boxes) == 9:
            print("[SUCCESS] All 9 boxes preserved through post-processing")
        else:
            print(f"[WARNING] Expected 9 boxes, got {len(boxes)}")
            
    except Exception as e:
        print(f"[ERROR] Post-processing test failed: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    # Test 2: Test full detect() method with bypassed filters
    print("\n" + "=" * 60)
    print("Test 2: Full Detection with Bypassed Filters")
    print("=" * 60)
    
    try:
        # Create mock detector that simulates CTD detection
        class MockCTDDetector(DeepLearningMangaDetector):
            def _ctd_detect(self, bgr):
                dummy_output = np.zeros((1, 100, 7), dtype=np.float32)
                for i in range(9):
                    dummy_output[0, i, 4] = 0.9 - (i * 0.05)
                    dummy_output[0, i, 0] = 100 + i * 100
                    dummy_output[0, i, 1] = 200 + i * 50
                    dummy_output[0, i, 2] = 80
                    dummy_output[0, i, 3] = 120
                
                return self._postprocess_ctd(dummy_output, bgr.shape, (1024, 1024))
        
        mock_detector = MockCTDDetector(model_type='ctd', confidence_threshold=0.15)
        print("[INFO] Mock CTD detector created")
        
        # Create test image
        test_img = Image.new('RGB', (800, 1200), color='white')
        
        print("[INFO] Running full detection...")
        boxes = mock_detector.detect(test_img)
        print(f"[SUCCESS] Detection completed: {len(boxes)} boxes")
        
        for i, box in enumerate(boxes):
            print(f"  Box {i}: ({box.x0}, {box.y0}, {box.x1}, {box.y1})")
        
        if len(boxes) == 9:
            print("[SUCCESS] All 9 boxes preserved through full detection pipeline")
            print("[SUCCESS] Heuristic filters successfully bypassed for CTD")
            return True
        else:
            print(f"[WARNING] Expected 9 boxes, got {len(boxes)}")
            print("[WARNING] Boxes may have been dropped by filters")
            return False
            
    except Exception as e:
        print(f"[ERROR] Full detection test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_onnx_detection()
    sys.exit(0 if success else 1)
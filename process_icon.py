from PIL import Image
import os

def create_square_icon(input_path, output_png, output_ico):
    img = Image.open(input_path).convert("RGBA")
    
    # Crop the image to its actual non-transparent bounding box
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
        
    # Target size: 256x256
    target_size = 256
    padding = 24  # small padding so it's as big as possible but still has some breathing room
    
    width, height = img.size
    scale = min((target_size - padding*2) / width, (target_size - padding*2) / height)
    
    new_width = int(width * scale)
    new_height = int(height * scale)
    
    img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
    
    # Create a white square box canvas
    canvas = Image.new("RGBA", (target_size, target_size), (255, 255, 255, 255))
    
    x = (target_size - new_width) // 2
    y = (target_size - new_height) // 2
    
    # Since canvas is solid white, we paste using the img itself as the alpha mask
    canvas.paste(img, (x, y), img)
    
    canvas.save(output_png, "PNG")
    canvas.save(output_ico, format="ICO", sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
    return canvas

if __name__ == "__main__":
    os.makedirs(r"C:\AntigravityProjects\MailAutomation\build", exist_ok=True)
    in_path = r"C:\Users\CLAWR\OneDrive\Desktop\Email Pilots Mini Logo.png"
    out_png = r"C:\AntigravityProjects\MailAutomation\build\icon.png"
    out_ico = r"C:\AntigravityProjects\MailAutomation\build\icon.ico"
    out_public_png = r"C:\AntigravityProjects\MailAutomation\public\assets\app_icon.png"
    
    canvas = create_square_icon(in_path, out_png, out_ico)
    canvas.save(out_public_png, "PNG")
    print("Icons generated with white box and cropped margins successfully.")
